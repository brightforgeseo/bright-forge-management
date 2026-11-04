'use strict';
const {randomUUID}=require('node:crypto');
const core=require('./ai-visibility-core.cjs');const providers=require('./ai-visibility-providers.cjs');
const ROOT='/api/ai-visibility';
const uuid=value=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value||''))core.invalid('Invalid identifier');return value;};
const stamp=()=>new Date().toISOString();
async function readBody(req){let b='';for await(const chunk of req){b+=chunk;if(Buffer.byteLength(b)>200000)throw Object.assign(Error('Request too large'),{status:413});}try{return b?JSON.parse(b):{};}catch{core.invalid('Invalid JSON');}}
function createVisibility({api,authenticate,env=process.env,collector=providers.collect}){
 const modelSet=()=>Object.fromEntries(providers.connections(env).map(p=>[p.engine,p.model]));
 async function projectFor(id,owner){const rows=await api(`/rest/v1/ai_visibility_projects?id=eq.${uuid(id)}&owner_id=eq.${encodeURIComponent(owner)}&limit=1`);if(!rows?.length)throw Object.assign(Error('Project not found'),{status:404});return rows[0];}
 async function runFor(id,owner){const rows=await api(`/rest/v1/ai_visibility_runs?id=eq.${uuid(id)}&owner_id=eq.${encodeURIComponent(owner)}&limit=1`);if(!rows?.length)throw Object.assign(Error('Run not found'),{status:404});return rows[0];}
 async function createRun(p,period,mode){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)||period>stamp().slice(0,7))core.invalid('Choose current or past month');if(!['api','consumer'].includes(mode))core.invalid('Invalid collection mode');
  core.validatePrompts(p.prompts);
  const models=mode==='api'?modelSet():{chatgpt:'consumer-app',gemini:'consumer-app',perplexity:'consumer-app'};
  const hash=core.fingerprint({prompts:p.prompts,project:core.validateProject(p),models,mode});
  return api('/rest/v1/rpc/ai_visibility_create_run','POST',{subject:p.owner_id,project:p.id,month:period,collection:mode,hash,model_set:models});
 }
 async function detail(id,owner){const r=await runFor(id,owner);const samples=await api(`/rest/v1/ai_visibility_samples?run_id=eq.${r.id}&order=prompt_index,engine,repetition&limit=500`);
  const prior=await api(`/rest/v1/ai_visibility_runs?project_id=eq.${r.project_id}&owner_id=eq.${encodeURIComponent(owner)}&period=lt.${r.period}&mode=eq.${r.mode}&fingerprint=eq.${r.fingerprint}&order=period.desc&limit=1`);
  let previous=null;if(prior?.length){const old=await api(`/rest/v1/ai_visibility_samples?run_id=eq.${prior[0].id}&limit=500`);previous={period:prior[0].period,summary:core.summary(old)};}
  return {run:r,samples,summary:core.summary(samples),by_engine:Object.fromEntries(core.ENGINES.filter(e=>r.snapshot.engines.includes(e)).map(e=>[e,core.summary(samples.filter(s=>s.engine===e))])),previous};
 }
 async function handle(req,res){
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const origin=req.headers.origin;const proto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim();if(origin&&origin!==`${proto}://${req.headers.host}`)return send(403,{error:'Cross-origin request denied'});
   const owner=await authenticate(req);if(!owner?.id)return send(401,{error:'Portal login required'});
   const path=new URL(req.url,'http://localhost').pathname.slice(ROOT.length).split('/').filter(Boolean);const method=req.method;
   if(method==='GET'&&path[0]==='connections')return send(200,{connections:providers.connections(env),scheduling:'Monthly, first available check each UTC month. No automatic external sends.'});
   if(path[0]==='projects'&&path.length===1){
    if(method==='GET')return send(200,{projects:await api(`/rest/v1/ai_visibility_projects?owner_id=eq.${encodeURIComponent(owner.id)}&archived=eq.false&order=created_at.desc&limit=200`)});
    if(method==='POST'){const body=await readBody(req);const p=core.validateProject(body);const rows=await api('/rest/v1/ai_visibility_projects','POST',{...p,owner_id:owner.id});return send(201,{project:rows[0]});}
   }
   if(path[0]==='projects'&&path[1]){
    const p=await projectFor(path[1],owner.id);
    if(path.length===2&&method==='GET'){const runs=await api(`/rest/v1/ai_visibility_runs?project_id=eq.${p.id}&owner_id=eq.${encodeURIComponent(owner.id)}&order=period.desc,created_at.desc&limit=100`);return send(200,{project:p,runs});}
    if(path.length===2&&method==='PATCH'){
     const body=await readBody(req);const update={...core.validateProject({...p,...body}),updated_at:stamp()};
     if(body.prompts!==undefined)update.prompts=core.validatePrompts(body.prompts);
     if(body.schedule_enabled!==undefined){if(typeof body.schedule_enabled!=='boolean')core.invalid('Invalid schedule');update.schedule_enabled=body.schedule_enabled;if(update.schedule_enabled){core.validatePrompts(update.prompts||p.prompts);const missing=providers.connections(env).filter(c=>(update.engines||p.engines).includes(c.engine)&&!c.ready);if(missing.length)core.invalid('Connect all selected API engines before enabling scheduling');}}
     if(body.archived!==undefined){if(typeof body.archived!=='boolean')core.invalid('Invalid archive');update.archived=body.archived;update.schedule_enabled=false;}
     const rows=await api(`/rest/v1/ai_visibility_projects?id=eq.${p.id}&owner_id=eq.${encodeURIComponent(owner.id)}`,'PATCH',update);return send(200,{project:rows[0]});
    }
    if(path.length===3&&path[2]==='runs'&&method==='POST'){if(p.archived)core.invalid('Project archived');const body=await readBody(req);const id=await createRun(p,body.period,body.mode);return send(201,{run_id:id});}
   }
   if(path[0]==='runs'&&path[1]){
    const run=await runFor(path[1],owner.id);
    if(path.length===2&&method==='GET')return send(200,await detail(run.id,owner.id));
    if(path.length===3&&path[2]==='retry'&&method==='POST'){
     if(run.mode!=='api')core.invalid('Only API runs can be retried');const p=await projectFor(run.project_id,owner.id);if(p.archived)core.invalid('Project archived');
     const rows=await api(`/rest/v1/ai_visibility_samples?run_id=eq.${run.id}&status=eq.failed&attempts=lt.3`,'PATCH',{status:'pending',error_code:null,updated_at:stamp()});return send(200,{retried:rows.length});
    }
    if(path.length===4&&path[2]==='samples'&&['POST','PATCH'].includes(method)){
     const id=uuid(path[3]);const samples=await api(`/rest/v1/ai_visibility_samples?id=eq.${id}&run_id=eq.${run.id}&limit=1`);if(!samples?.length)return send(404,{error:'Sample not found'});const sample=samples[0];const body=await readBody(req);let update;
     if(method==='POST'){
      if(run.mode!=='consumer')core.invalid('Cannot replace API evidence with manual evidence');if(sample.status==='complete')core.invalid('Saved evidence is immutable; review labels separately');
      const observation=core.validateObservation(body);if(observation.observed_at.slice(0,7)!==run.period)core.invalid('Observation must be from the selected report month');
      update={...observation,...core.analyse(run.snapshot,observation),status:'complete',reviewed_by:owner.id,reviewed_at:stamp(),updated_at:stamp()};
     }else{if(sample.status!=='complete')core.invalid('Complete evidence first');if(!['yes','no','unclear'].includes(body.recommendation))core.invalid('Choose yes, no or unclear');update={recommendation:body.recommendation,reviewed_by:owner.id,reviewed_at:stamp(),updated_at:stamp()};}
     const rows=await api(`/rest/v1/ai_visibility_samples?id=eq.${id}&run_id=eq.${run.id}&status=eq.${sample.status}`,'PATCH',update);if(rows.length!==1)throw Object.assign(Error('Evidence changed; refresh before saving'),{status:409});return send(200,{sample:rows[0]});
    }
   }
   return send(404,{error:'Visibility route not found'});
  }catch(e){const status=e.status||500;return send(status,{error:status<500?e.message:'AI visibility request failed. No successful collection is implied.'});}
 }
 let active=false,timer,scheduledAt=0;const worker=randomUUID();
 async function tick(){if(active)return;active=true;try{
  if(Date.now()-scheduledAt>60000){scheduledAt=Date.now();const projects=await api('/rest/v1/ai_visibility_projects?schedule_enabled=eq.true&archived=eq.false&limit=200');
   for(const p of projects){const allowed=await api(`/rest/v1/allowed_users?email=not.is.null&select=email&limit=500`);const u=await api(`/auth/v1/admin/users/${p.owner_id}`);if(u?.email_confirmed_at&&!u.deleted_at&&(!u.banned_until||Date.parse(u.banned_until)<Date.now())&&allowed.some(a=>a.email?.toLowerCase()===u.email?.toLowerCase()))await createRun(p,stamp().slice(0,7),'api');}
  }
  const job=await api('/rest/v1/rpc/ai_visibility_claim','POST',{worker});if(!job)return;
  const {sample,run}=job;const target=`/rest/v1/ai_visibility_samples?id=eq.${sample.id}&status=eq.running&lease_id=eq.${worker}`;
  try{const observation=await collector(sample.engine,sample.prompt,{...run.snapshot}, {env});await api(target,'PATCH',{...observation,...core.analyse(run.snapshot,observation),status:'complete',error_code:null,lease_id:null,lease_expires_at:null,updated_at:stamp()});}
  catch(e){const code=/^(PROVIDER_[A-Z_0-9]+)$/.test(e.message)?e.message:'COLLECTION_FAILED';await api(target,'PATCH',{status:'failed',error_code:code,lease_id:null,lease_expires_at:null,updated_at:stamp()});}
 }finally{active=false;}}
 return {handle,tick,detail,createRun,start(){timer=setInterval(()=>tick().catch(()=>{}),3000);timer.unref();tick().catch(()=>{});},stop(){clearInterval(timer);}};
}
module.exports={createVisibility};
