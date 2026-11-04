'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { ownTasks, fetchPublicReference } = require('./private-bot-sources.cjs');
const {prepareUpload,decodeFile,safeCsv,MIME}=require('./private-bot-files.cjs');
const {randomUUID}=require('node:crypto');
const {createGoogleWorkspace}=require('./private-bot-google-workspace.cjs');
function reply(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req, maximum=64000) {
  let text = ''; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > maximum) throw Object.assign(new Error('request too large'), { status: 413 }); text += chunk; }
  try { const value = JSON.parse(text || '{}'); if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value; }
  catch { throw Object.assign(new Error('invalid JSON object'), { status: 400 }); }
}
function fields(value, allowed) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw Object.assign(new Error('unsupported field'), { status: 400 });
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Object.assign(new Error('invalid text field'), { status: 400 });
  return value.trim();
}
function createPrivateBotsHandler({ authenticate, api, publicReference = fetchPublicReference, telegramPortal, googleWorkspace }) {
  const google=googleWorkspace||createGoogleWorkspace({api});
  return async (req, res) => {
    try {
      const user = await authenticate(req);
      if (!user) return reply(res, 401, { error: 'valid authorised session required' });
      const url = new URL(req.url, 'http://portal.invalid');
      const parts = url.pathname.replace(/^\/api\/private-bots\/?/, '').split('/').filter(Boolean);
      if(parts.join('/')==='runtime' && req.method==='GET')return reply(res,200,require('./private-bot-build.cjs').runtimeState());
      require('./private-bot-build.cjs').assertRuntime();
      const ownerFilter = `owner_id=eq.${encodeURIComponent(user.id)}`;
      if(parts[0]==='ordinary' && parts[1]==='artifacts' && parts.length===3 && UUID.test(parts[2]) && req.method==='GET'){
        const bots=await api(`/rest/v1/private_bots?${ownerFilter}&slot=eq.0&select=id`);
        if(bots.length!==1)return reply(res,404,{error:'output not found'});
        const rows=await api(`/rest/v1/private_bot_artifacts?id=eq.${parts[2]}&bot_id=eq.${bots[0].id}&${ownerFilter}&select=id,name,format,content,binary_base64&limit=1`);
        if(rows.length!==1)return reply(res,404,{error:'output not found'});
        const artifact=rows[0];artifact.mime=MIME[artifact.format];
        if(artifact.format==='csv'){artifact.content=safeCsv(artifact.binary_base64?Buffer.from(artifact.binary_base64,'base64').toString('utf8'):artifact.content);artifact.binary_base64=Buffer.from(artifact.content).toString('base64');}
        return reply(res,200,{artifact});
      }
      if(parts[0]==='google'&&parts.length<=2){
        try{return reply(res,200,await google.route(user.id,parts[1]||'',req.method,req.method==='POST'?await body(req):{}));}
        catch(e){return reply(res,400,{error:/^(GOOGLE_[A-Z_]+|INVALID_GOOGLE_[A-Z_]+|CAPABILITY_DENIED)$/.test(e.message)?e.message:'GOOGLE_SERVICE_UNAVAILABLE'});}
      }
      if (parts[0] === 'telegram' && parts.length <= 2 && telegramPortal) {
        const result = await telegramPortal(user.id, parts[1] || '', req.method, ['POST','PATCH'].includes(req.method) ? await body(req) : {});
        return reply(res, result.status, result.data);
      }
      const tasksForOwner = async () => ownTasks(await api('/rest/v1/client_boards?select=id,board_data&archived=eq.false&limit=1000'), user.id);
      if (parts.join('/') === 'sources/tasks' && req.method === 'GET') return reply(res, 200, { tasks: await tasksForOwner() });
      if (!parts.length && req.method === 'GET') {
        return reply(res, 200, { bots: await api(`/rest/v1/private_bots?${ownerFilter}&slot=gt.0&order=slot.asc`) });
      }
      const [id, child, jobId] = parts;
      if (!UUID.test(id || '') || parts.length > 3 || (child && !['jobs','artifacts'].includes(child)) || (jobId && !UUID.test(jobId))) return reply(res, 404, { error: 'not found' });
      const botPath = `/rest/v1/private_bots?id=eq.${id}&${ownerFilter}`;
      const bots = await api(botPath); const bot = bots?.[0];
      if (!bot || bot.slot === 0) return reply(res, 404, { error: 'bot not found' });
      if(child==='artifacts' && req.method==='POST' && !jobId){
        const p=await body(req,2900000);fields(p,['name','format','base64','requestKey']);
        if(typeof p.base64!=='string'||p.base64.length>2800000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.base64)||typeof p.requestKey!=='string'||!/^[\w:-]{8,160}$/.test(p.requestKey))return reply(res,400,{error:'Invalid file or upload identity.'});
        let file,projection;
        try{file=await prepareUpload({name:p.name,format:p.format,bytes:Buffer.from(p.base64,'base64')});projection=await decodeFile({format:file.format,bytes:file.bytes});}catch{return reply(res,400,{error:'Unsupported or unsafe file. Maximum 2 MiB; TXT, MD, JSON, CSV, DOCX, XLSX and PDF text/cell projections only.'});}
        const content=(file.format==='csv'?file.bytes.toString('utf8'):(projection.text||JSON.stringify(projection.sheets||projection.rows))).slice(0,60000);
        const artifact=await api('/rest/v1/rpc/private_bot_upload','POST',{subject:user.id,bot:id,identity_key:p.requestKey,payload:{name:file.name,format:file.format,content,binary_base64:file.bytes.toString('base64')}});
        return reply(res,201,{artifact,normalised:true,limitations:'Text/cell projection; original complex formatting is not preserved.'});
      }
      if (child==='artifacts' && req.method==='GET') {
        const rows=await api(`/rest/v1/private_bot_artifacts?bot_id=eq.${id}&${ownerFilter}${jobId?`&id=eq.${jobId}`:''}&select=${jobId?'id,name,format,content,binary_base64,source_file,created_at,job_id':'id,name,format,source_file,created_at,job_id'}&order=created_at.desc&limit=100`);
        if(jobId&&!rows[0])return reply(res,404,{error:'output not found'});
        if(jobId){const a=rows[0];a.mime=MIME[a.format];if(a.format==='csv'){a.content=safeCsv(a.binary_base64?Buffer.from(a.binary_base64,'base64').toString('utf8'):a.content);a.binary_base64=Buffer.from(a.content).toString('base64');}}
        return reply(res,200,jobId?{artifact:rows[0]}:{artifacts:rows});
      }
      if (!child && req.method === 'GET') return reply(res, 200, { bot });
      if (!child && req.method === 'PATCH') {
        const payload = await body(req); fields(payload, ['name', 'instructions', 'context']);
        const patch = {};
        for (const k of Object.keys(payload)) patch[k] = text(payload[k], k === 'name' ? 80 : k === 'instructions' ? 6000 : 24000, k === 'name');
        patch.updated_at = new Date().toISOString();
        const updated = await api(botPath, 'PATCH', patch);
        return reply(res, 200, { bot: updated[0] });
      }
      if (child === 'jobs' && req.method === 'GET') {
        return reply(res, 200, { jobs: await api(`/rest/v1/private_bot_jobs?bot_id=eq.${id}&${ownerFilter}${jobId ? `&id=eq.${jobId}` : ''}&order=created_at.desc&limit=100`) });
      }
      if (child === 'jobs' && req.method === 'POST' && !jobId) {
        const payload = await body(req); fields(payload, ['message', 'retryJobId', 'publicUrl', 'taskId','requestKey']);
        if(payload.requestKey!==undefined&&(typeof payload.requestKey!=='string'||!/^[\w:-]{8,160}$/.test(payload.requestKey)))return reply(res,400,{error:'Invalid request identity.'});
        let message; let reference = '';
        if (payload.retryJobId !== undefined) {
          if (!UUID.test(payload.retryJobId) || payload.message !== undefined) return reply(res, 400, { error: 'invalid retry' });
          const rows = await api(`/rest/v1/private_bot_jobs?id=eq.${payload.retryJobId}&bot_id=eq.${id}&${ownerFilter}&status=eq.failed`);
          if (!rows[0]) return reply(res, 404, { error: 'failed job not found' });
          return reply(res,409,{error:'Outcome uncertain: reconcile this exact job and its operation receipts before any provider replay. No new job was created.',jobId:rows[0].id});
        } else message = text(payload.message, 12000, true);
        if (payload.retryJobId && (payload.publicUrl || payload.taskId)) return reply(res, 400, { error: 'retry reuses original sources' });
        if (payload.taskId) {
          const taskId = text(payload.taskId, 160, true);
          const task = (await tasksForOwner()).find(t => t.id === taskId);
          if (!task) return reply(res, 404, { error: 'assigned task not found' });
          reference += `Your assigned Portal task snapshot (read-only):\n${JSON.stringify(task)}\n`;
        }
        if (payload.publicUrl) {
          try { reference += await publicReference(text(payload.publicUrl, 2048, true)); }
          catch { return reply(res, 400, { error: 'Could not read that public HTTPS page. Private addresses and credentialed URLs are blocked.' }); }
        }
        if(!payload.requestKey)return reply(res,400,{error:'A stable requestKey is required. Reload the updated Portal.'});
        const job = await api('/rest/v1/rpc/private_bot_enqueue', 'POST', {subject:user.id,bot:id,identity_key:payload.requestKey,payload:{message,reference_text:reference.slice(0,16000),identity:{message,publicUrl:payload.publicUrl||'',taskId:payload.taskId||''}}});
        return reply(res, 202, { job });
      }
      return reply(res, 405, { error: 'method not allowed' });
    } catch (error) {
      const status = error.status === 409 ? 409 : [400, 401, 403, 413].includes(error.status) ? error.status : 503;
      return reply(res, status, { error: status === 409 ? 'this bot already has an active task' : status === 503 ? 'private bot service unavailable' : error.message });
    }
  };
}
module.exports = { createPrivateBotsHandler, UUID };
