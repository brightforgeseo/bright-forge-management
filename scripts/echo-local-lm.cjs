'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function buildLocalAnalysisPrompt(job) {
  const message = String(job?.payload?.message || '').trim();
  if (!message) throw new Error('Local analysis message is required');
  return [
    'You are Bright Forge Local LM Slave, a bounded internal analysis worker.',
    'Analyse only the supplied material in the request and any clearly labelled context below.',
    'Do not invent facts. State uncertainty or missing evidence explicitly.',
    'Do not send messages, change files, access networks, or perform external actions. Do not execute tools.',
    'Return concise structured analysis suitable for senior review, not client-facing copy.',
    '',
    'Request:',
    message,
  ].join('\n');
}

function runLocalAnalysis(job) {
  const bin = process.env.ECHO_LOCAL_LM_BIN || path.join(process.env.HOME, '.local', 'bin', 'brightforge-lm');
  const run = spawnSync(bin, ['--stdin', '--max-tokens', '1000'], {
    input: buildLocalAnalysisPrompt(job), encoding: 'utf8', timeout: 180000, maxBuffer: 2_000_000,
  });
  if (run.error || run.status !== 0) throw new Error((run.stderr || run.error?.message || 'Local LM Slave failed').slice(0, 1000));
  const response = run.stdout.trim();
  if (!response) throw new Error('Local LM Slave returned no response');
  return response;
}

module.exports = { buildLocalAnalysisPrompt, runLocalAnalysis };
