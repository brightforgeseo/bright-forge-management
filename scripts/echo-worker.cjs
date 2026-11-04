#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const os = require('node:os');
const { isDeliverable, runMissionJob, verifiedResult } = require('./echo-work-bridge.cjs');
const { retryDelaySeconds } = require('./echo-queue-core.cjs');
const { runLocalAnalysis } = require('./echo-local-lm.cjs');
const { runOrdinaryEchoJob } = require('./portal-native-work.cjs');
const runtimeBuild = require('./private-bot-build.cjs');

const SUPABASE_URL = process.env.SUPABASE_INTERNAL_URL || 'http://127.0.0.1:54321';

function statusEnv() {
  const out = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8', cwd: `${process.env.HOME}/bright-forge-management`,
  });
  return Object.fromEntries(out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [key, rawValue = ''] = line.split(/=(.*)/s).slice(0, 2);
    return [key, rawValue.replace(/^['"]|['"]$/g, '')];
  }));
}

function createApi(serviceKey) {
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  return async function api(path, method = 'GET', body) {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        Prefer: 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
}

function runChatJob(job) {
  // requested_by is established at authenticated queue ingress, never from payload/history.
  // The child treats queued identities as work-only until stronger owner provenance exists.
  const requestedBy = typeof job.requested_by === 'string' ? job.requested_by : '';
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedBy);
  if(!validId){const error=new Error('Authenticated Portal principal required');error.permanent=true;throw error;}
  const childEnv = Object.fromEntries(['HOME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'XDG_RUNTIME_DIR', 'HERMES_HOME']
    .filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  childEnv.ECHO_EXECUTION_PRINCIPAL = JSON.stringify({
    version: 1, ingress: 'portal', subject: validId ? requestedBy.toLowerCase() : 'unknown',
  });
  const payload = job.payload || {};
  const prompt = `You are Echo, Bright Forge's internal SEO operations assistant. Reply directly and professionally to this team request. Do not send external messages or make irreversible changes without explicit approval.\n\nTeam request:\n${payload.message}\n\nRecent context:\n${(payload.history || []).map((item) => `${item.role}: ${item.content}`).join('\n')}`;
  const run = spawnSync(require('node:path').join(require('node:os').homedir(),'state/work-continuity/portal_work_entry.py'), ['chat'], {
    env: childEnv, input:prompt, encoding: 'utf8', timeout: 240000, maxBuffer: 2_000_000,
  });
  if (run.error || run.status !== 0) throw new Error((run.stderr || run.error?.message || 'Hermes worker failed').slice(0, 1000));
  const frame=run.stdout.split(/\r?\n/).reverse().find(line=>line.startsWith('ECHO_PORTAL_REPLY='));
  let reply;try{reply=JSON.parse(frame?.slice('ECHO_PORTAL_REPLY='.length));}catch{throw new Error('Native chat reply framing failed');}
  if(reply.version!==1||reply.subject!==requestedBy.toLowerCase()||!/^\d{8}_\d{6}_[0-9a-f]{6}$/.test(reply.session_id)||typeof reply.response!=='string'||!reply.response.trim())throw new Error('Native chat reply binding failed');
  return reply.response;
}

function createWorker({ api, workerId, now = () => new Date(), runLocalAnalysis: localRunner = runLocalAnalysis, runChatJob: chatRunner = runChatJob, runMissionJob: missionRunner = runMissionJob, ordinaryRunner = runOrdinaryEchoJob, logError = console.error }) {
  if (typeof api !== 'function') throw new Error('Echo worker API is required');
  if (!workerId) throw new Error('Echo worker id is required');
  // Existing process-local digest is initialise-once; never refresh it on drift.
  runtimeBuild.initialise();runtimeBuild.assertRuntime();

  const timestamp = () => now().toISOString();
  const jobPath = (job) => `/rest/v1/echo_jobs?id=eq.${job.id}`;
  // A completion RPC can commit just before a network response is lost. Only a still-running
  // lease may be requeued, so an ambiguous success cannot be overwritten back to queued.
  const runningJobPath = (job) => `${jobPath(job)}&status=eq.running`;

  function runJob(job) {
    return job?.job_type === 'local-analysis' ? localRunner(job) : chatRunner(job);
  }

  async function reclaimStaleJobs() {
    try {
      await api('/rest/v1/rpc/reclaim_stale_echo_jobs', 'POST', { worker_name: workerId });
    } catch (error) {
      logError('[echo-worker] stale-job reclaim failed:', error.message);
    }
  }

  async function processOne() {
    runtimeBuild.assertRuntime();
    await reclaimStaleJobs();
    const jobs = await api('/rest/v1/rpc/claim_echo_job', 'POST', { worker_name: workerId });
    const job = jobs?.[0];
    if (!job) return false;

    let heartbeat;
    let pendingHeartbeat;
    let leaseUncertain = false;
    let ordinary = false;
    const controller = new AbortController();
    try {
      // Refresh the lease immediately before potentially long-running inference.
      ordinary = job.job_type === 'chat';
      const refreshed = await api(ordinary ? `${runningJobPath(job)}&locked_by=eq.${encodeURIComponent(workerId)}` : jobPath(job), 'PATCH', { locked_at: timestamp(), updated_at: timestamp() });
      if (ordinary && !refreshed?.length) throw Object.assign(new Error('Ordinary work lease lost before execution'), {permanent:true});
      const longWork = !ordinary && isDeliverable(job);
      if (longWork || ordinary) heartbeat = setInterval(() => {
        if (pendingHeartbeat) return;
        pendingHeartbeat = api(`${runningJobPath(job)}&locked_by=eq.${encodeURIComponent(workerId)}`, 'PATCH', { locked_at: timestamp(), updated_at: timestamp() })
          .then(rows => { if (!rows?.length) { leaseUncertain = true; controller.abort(); } })
          .catch(() => { leaseUncertain = true; controller.abort(); })
          .finally(() => { pendingHeartbeat = null; });
      }, 15000);
      runtimeBuild.assertRuntime();
      const value = await (ordinary ? ordinaryRunner({api,job,signal:controller.signal}) : longWork ? missionRunner(job) : runJob(job));
      clearInterval(heartbeat);
      if (pendingHeartbeat) await pendingHeartbeat;
      if (leaseUncertain) throw Object.assign(new Error('Mission lease uncertain; preserved native checkpoint, no replay'), { permanent: true });
      runtimeBuild.assertRuntime();
      const record = longWork ? verifiedResult(job, value) : { response: ordinary ? value.response : value, ...(ordinary ? { artifacts: value.artifacts || [] } : {}), reply_available: true, reply_delivered: false, workflow_complete: false };
      if (ordinary && record.artifacts.length) record.response += '\n\n' + record.artifacts.map((file,index) => `Saved output ${index+1}: https://echo-ben.tailfdbc33.ts.net/?ordinaryArtifact=${job.id}.${index}`).join('\n');
      const response = record.response;
      // Local analysis is an internal result only, even when malformed legacy data has a channel id.
      if (job.job_type !== 'local-analysis' && job.channel_id) {
        if (ordinary) {
          const completed = await api('/rest/v1/rpc/complete_ordinary_echo_chat_job', 'POST', { job_id:job.id, worker:workerId, response, artifacts:record.artifacts });
          if (!completed?.length) throw Object.assign(new Error('Ordinary completion refused; retained outcome, no replay'), {permanent:true});
        }
        else await api('/rest/v1/rpc/complete_echo_chat_job', 'POST', { job_id: job.id, response });
        if (!ordinary) await api(`${jobPath(job)}&status=eq.succeeded`, 'PATCH', { result: { ...record, reply_available: true, reply_delivered: true }, updated_at: timestamp() });
      } else {
        const finished = await api((longWork || ordinary) ? `${runningJobPath(job)}&locked_by=eq.${encodeURIComponent(workerId)}` : jobPath(job), 'PATCH', {
          status: 'succeeded', result: record, finished_at: timestamp(),
          locked_at: null, locked_by: null, updated_at: timestamp(),
        });
        if (ordinary && !finished?.length) throw Object.assign(new Error('Ordinary work outcome retained; outer lease lost, no replay'), {permanent:true});
      }
    } catch (error) {
      const message = String(error.message).slice(0, 1000);
      const longWork = !ordinary && isDeliverable(job);
      const retry = !ordinary && !longWork && !error.permanent && job.attempts < job.max_attempts;
      const failed = await api((longWork || ordinary) ? `${runningJobPath(job)}&locked_by=eq.${encodeURIComponent(workerId)}` : runningJobPath(job), 'PATCH', retry
        ? {
          status: 'queued', available_at: new Date(now().getTime() + retryDelaySeconds(job.attempts) * 1000).toISOString(),
          error_code: 'ECHO_JOB_RETRYABLE_FAILURE', error_message: message,
          locked_at: null, locked_by: null, updated_at: timestamp(),
        }
        : {
          status: 'failed', error_message: message, result: { workflow_complete: false, reply_delivered: false, disposition: error.permanent ? 'contract_or_mission_non_success' : 'worker_failure' }, finished_at: timestamp(),
          locked_at: null, locked_by: null, updated_at: timestamp(),
        });
      if (ordinary && !failed?.length) console.warn('[echo-worker] Ordinary work ownership changed; replacement lease and retained outcome left untouched');
    } finally {
      clearInterval(heartbeat);
      if (pendingHeartbeat) await pendingHeartbeat;
    }
    return true;
  }

  return { processOne, reclaimStaleJobs, runJob, runtimeState: runtimeBuild.runtimeState };
}

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || statusEnv().SERVICE_ROLE_KEY;
  const workerId = `${process.env.ECHO_WORKER_ID || os.hostname()}-${process.pid}-${require('node:crypto').randomUUID()}`;
  const worker = createWorker({ api: createApi(serviceKey), workerId });
  const boot=worker.runtimeState();
  console.info('[echo-worker] runtime',JSON.stringify({pid:boot.pid,bootedAt:boot.bootedAt,digest:boot.digest,modules:boot.modules}));
  while (true) {
    try {
      if (!await worker.processOne()) await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('[echo-worker]', error.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

if (require.main === module) main().catch((error) => {
  console.error('[echo-worker]', error.message);
  process.exitCode = 1;
});

module.exports = { createApi, createWorker, runChatJob, isDeliverable };
