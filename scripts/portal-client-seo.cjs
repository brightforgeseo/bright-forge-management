'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function validateProject(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||!UUID.test(body.client_id||''))fail('Choose an existing client');
 const domain=String(body.domain||'').trim().toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)||/\.(local|internal|localhost)$/.test(domain))fail('Enter a public domain without a path');
 const brand=typeof body.brand==='string'?body.brand.trim():'';if(brand.length<3||brand.length>120)fail('Brand must contain 3 to 120 characters');
 const market=body.market??'Australia',language=body.language??'English';if(typeof market!=='string'||!market.trim()||market.length>150||typeof language!=='string'||!language.trim()||language.length>80)fail('Choose an explicit market and language');
 const list=(name,max,length)=>{const values=body[name]??[];if(!Array.isArray(values)||values.length>max||values.some(v=>typeof v!=='string'||!v.trim()||v.length>length))fail('Invalid '+name);const out=values.map(v=>v.trim()),keys=out.map(v=>name==='keywords'?v.toLowerCase():v);if(new Set(keys).size!==keys.length)fail('Remove duplicate '+name);return out;};
 return {client_id:body.client_id,domain,brand,market:market.trim(),language:language.trim(),keywords:list('keywords',500,300),prompts:list('prompts',50,2000)};
}
function deriveObservation(project,run,actor){
 const observationTime=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail('A verified observation timestamp is required; its age is unknown',409);return new Date(value).toISOString();};
 if(!run||run.ownerId!==actor)fail('Research owner does not match this login',403);
 if(!['completed','partial'].includes(run.status)||!run.result)fail('A completed research result is required',409);
 const input=run.input;if(input.location!==project.market||input.language!==project.language)fail('Research market or language differs from the saved project',409);
 if(input.target!==project.domain)fail('Research domain differs from the saved project',409);
 if(input.operation==='serp'){
  const keyword=input.keywords?.[0];if(!project.keywords.some(k=>k.toLowerCase()===String(keyword).toLowerCase()))fail('Keyword is not tracked in this client project',409);
  const checkedDepth=input.depth||10;const organic=(run.result.rows||[]).filter(r=>r.type==='organic'&&Number.isInteger(r.rank_group)&&r.rank_group>0&&r.rank_group<=checkedDepth);const root=project.domain.replace(/^www\./,'');
  const matches=organic.filter(r=>{try{const host=new URL(r.url).hostname.replace(/^www\./,'');return host===root||host.endsWith('.'+root);}catch{return false;}}).sort((a,b)=>a.rank_group-b.rank_group);const found=matches[0];
  const overview={keyword,domain:project.domain,market:project.market,language:project.language,position:found?.rank_group??null,url:found?.url??null,state:found?'ranked':organic.length?'not_found':'no_organic_results',checkedDepth,device:'desktop',observedAt:run.result.retrievedAt||null,cached:run.result.cached===true,evidenceHash:run.result.evidenceHash||null};
  return {kind:'keyword',observed_at:observationTime(overview.observedAt),source_run_id:run.id,snapshot:{...overview,overview,evidence:run.result.rows||[],method:run.result.method||'Google organic SERP snapshot'}};
 }
 if(input.operation==='ai-visibility'){
  if(input.brand!==project.brand)fail('Research brand differs from the saved project',409);
  if(!input.keywords?.every(p=>project.prompts.includes(p)))fail('A prompt is not tracked in this client project',409);
  const report=run.result.report;if(!report||!Array.isArray(report.observations))fail('Prompt observation evidence is unavailable',409);
  const overview={domain:project.domain,brand:project.brand,market:project.market,language:project.language,observedAt:report.created_at,complete:report.complete===true,expectedSamples:report.expected_samples,completedSamples:report.completed_samples,summary:report.summary,prompts:input.keywords};
  return {kind:'visibility',observed_at:observationTime(overview.observedAt),source_run_id:run.id,snapshot:{overview,observations:report.observations,method:report.method}};
 }
 fail('Only verified SERP or prompt observations can enter tracking history');
}
function createClientSeoHandler({authenticate,api,readResearch}){
 const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
 const body=async req=>{let text='',bytes=0;for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>190000)fail('Request too large',413);text+=chunk;}try{return JSON.parse(text);}catch{fail('Invalid JSON');}};
 const publicProject=row=>row?{...row,...row.config,config:undefined}:null;
 const id=value=>{if(!UUID.test(value||''))fail('Invalid identifier');return value;};
 const getProject=async client=>(await api('/rest/v1/portal_seo_projects?client_id=eq.'+id(client)+'&select=*&limit=1'))[0]||null;
 return async(req,res)=>{try{
  const origin=req.headers.origin,proto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim();if(origin&&origin!==proto+'://'+req.headers.host)return send(res,403,{error:'Same-origin request required'});
  const user=await authenticate(req);if(!UUID.test(user?.id||''))return send(res,401,{error:'Active portal login required'});
  const url=new URL(req.url,'http://localhost'),route=url.pathname.slice('/api/client-seo'.length).split('/').filter(Boolean);
  if(req.method==='GET'&&route[0]==='clients'&&route.length===1){const clients=await api('/rest/v1/client_boards?archived=not.is.true&select=id,board_id:board_data->>id,name:board_data->>name,website:board_data->>website,color:board_data->>color,updated_at&order=created_at.asc&limit=1000');return send(res,200,{clients:clients.filter(c=>!['0 - other tasks','0 - seo monthly reports'].includes(String(c.name||'').trim().toLowerCase()))});}
  if(req.method==='GET'&&route[0]==='projects'&&route.length===1){const projects=await api('/rest/v1/portal_seo_projects?select=id,client_id,client_name,revision,updated_at,keyword_count,prompt_count,domain:config->>domain,brand:config->>brand,market:config->>market,language:config->>language&order=updated_at.desc&limit=1000');return send(res,200,{projects});}
  if(req.method==='GET'&&route[0]==='projects'&&route.length===2)return send(res,200,{project:publicProject(await getProject(route[1]))});
  if(req.method==='POST'&&route[0]==='projects'&&route.length===1){
   const data=await body(req);if(Object.keys(data).some(k=>!['id','client_id','domain','brand','market','language','keywords','prompts','revision'].includes(k)))fail('Unsupported project field');const config=validateProject(data);if(!Number.isSafeInteger(data.revision)||data.revision<0)fail('A saved project revision is required');
   const clients=await api('/rest/v1/client_boards?id=eq.'+id(config.client_id)+'&select=id,name:board_data->>name&limit=1');if(!clients.length)fail('Client no longer exists',404);
   try{const rows=await api('/rest/v1/rpc/portal_seo_save_project','POST',{p_client:config.client_id,p_expected:data.revision,p_config:config,p_actor:user.id,p_name:clients[0].name||'Client'});return send(res,200,{project:publicProject(rows[0])});}
   catch(e){if(e.status!==409)throw e;const latest=await getProject(config.client_id);if(latest&&JSON.stringify(validateProject(latest.config))===JSON.stringify(config))return send(res,200,{project:publicProject(latest)});return send(res,409,{error:'Project changed elsewhere. Your draft has not replaced the saved version.',project:publicProject(latest)});}
  }
  if(route[0]==='drafts'&&route.length===2){
   const surface=decodeURIComponent(route[1]);if(!/^[-a-zA-Z0-9:_]{1,160}$/.test(surface))fail('Invalid draft surface');
   if(req.method==='GET'){const rows=await api('/rest/v1/portal_private_drafts?owner_id=eq.'+user.id+'&surface=eq.'+encodeURIComponent(surface)+'&select=payload,revision,updated_at&limit=1');return send(res,200,{draft:rows[0]||null});}
   if(req.method==='POST'){const data=await body(req);if(Object.keys(data).some(k=>!['revision','payload'].includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0||!data.payload||typeof data.payload!=='object'||Array.isArray(data.payload))fail('Invalid draft update');try{const rows=await api('/rest/v1/rpc/portal_save_private_draft','POST',{p_owner:user.id,p_surface:surface,p_expected:data.revision,p_payload:data.payload});return send(res,200,{draft:{payload:rows[0].payload,revision:rows[0].revision,updated_at:rows[0].updated_at}});}catch(e){if(e.status===409)return send(res,409,{error:'Draft changed on another page or device. Unsynced text has not overwritten it.'});throw e;}}
  }
  if(route[0]==='projects'&&route.length>=3){
   const project=await getProject(route[1]);if(!project)fail('Save this client project first',404);
   if(req.method==='GET'&&route[2]==='current'&&route.length===3){const observations=[];for(let offset=0;offset<10000;offset+=500){const page=await api('/rest/v1/rpc/portal_seo_current_observations?limit=500&offset='+offset,'POST',{p_project:project.id});observations.push(...page);if(page.length<500)return send(res,200,{observations:observations.map(o=>({id:o.id,kind:o.kind,source_run_id:o.source_run_id,created_at:o.created_at,observed_at:o.observed_at,overview:o.snapshot.overview}))});}fail('Current observations exceeded the safe result bound',413);}
   if(req.method==='GET'&&route[2]==='observations'&&route.length===3){const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail('Invalid history offset');const rows=await api('/rest/v1/portal_seo_observations?project_id=eq.'+project.id+'&select=id,kind,source_run_id,created_at,observed_at,overview:snapshot->overview&order=observed_at.desc.nullslast,created_at.desc,id.desc&limit=101&offset='+offset);return send(res,200,{observations:rows.slice(0,100),hasMore:rows.length>100,nextOffset:offset+100});}
   if(req.method==='GET'&&route[2]==='observations'&&route.length===4){const rows=await api('/rest/v1/portal_seo_observations?project_id=eq.'+project.id+'&id=eq.'+id(route[3])+'&select=*&limit=1');return send(res,rows.length?200:404,rows.length?{observation:rows[0]}:{error:'Observation not found'});}
   if(req.method==='POST'&&route[2]==='import'&&route.length===3){const data=await body(req);if(Object.keys(data).some(k=>k!=='runId'))fail('Only a verified saved run identifier is accepted');const run=readResearch(user.id,id(data.runId)),observation=deriveObservation({...project.config,id:project.id},run,user.id);let saved;
    try{saved=await api('/rest/v1/portal_seo_observations','POST',{project_id:project.id,...observation,added_by:user.id});}catch(e){if(e.status!==409)throw e;saved=await api('/rest/v1/portal_seo_observations?project_id=eq.'+project.id+'&source_run_id=eq.'+run.id+'&kind=eq.'+observation.kind+'&select=*&limit=1');if(!saved.length)throw e;}
    return send(res,200,{observation:{id:saved[0].id,kind:saved[0].kind,source_run_id:saved[0].source_run_id,created_at:saved[0].created_at,overview:saved[0].snapshot.overview}});
   }
  }
  return send(res,404,{error:'Client workspace route not found'});
 }catch(e){const status=e.status||503;return send(res,status,{error:status===409?'Saved version changed. Reload it before trying again.':status<500?e.message:'Client workspace storage is unavailable. No save is implied.'});}};
}
module.exports={UUID,fail,validateProject,deriveObservation,createClientSeoHandler};
