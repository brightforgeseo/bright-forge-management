'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),{createHash}=require('node:crypto');
const {durableCall}=require('./private-bot-operations.cjs');
const {decodeFile}=require('./private-bot-files.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
function validate(args){
 if(!args||Object.keys(args).sort().join()!=='code,input_artifact_ids,outputs'||typeof args.code!=='string'||Buffer.byteLength(args.code)>60000||!args.code.trim())throw Error('INVALID_LOCAL_WORK');
 for(const k of ['input_artifact_ids','outputs'])if(typeof args[k]!=='string'||Buffer.byteLength(args[k])>4096)throw Error('INVALID_LOCAL_WORK');
 let ids,outputs;try{ids=JSON.parse(args.input_artifact_ids);outputs=JSON.parse(args.outputs);}catch{throw Error('INVALID_LOCAL_WORK');}
 if(!Array.isArray(ids)||ids.length>16||ids.some(x=>typeof x!=='string'||!UUID.test(x))||new Set(ids).size!==ids.length)throw Error('INVALID_LOCAL_WORK');
 if(!Array.isArray(outputs)||!outputs.length||outputs.length>16||outputs.some(x=>!x||Object.keys(x).sort().join()!=='format,name'||!['txt','md','csv','json'].includes(x.format)||typeof x.name!=='string'||!NAME.test(x.name)||x.name.includes('..')||!x.name.endsWith('.'+x.format))||new Set(outputs.map(x=>x.name)).size!==outputs.length)throw Error('UNSUPPORTED_LOCAL_OUTPUT');
 return {ids,outputs};
}
async function bounded(p,ms=1000){let t;try{return await Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>r(Error('LOCAL_FENCE_UNAVAILABLE')),ms);})]);}finally{clearTimeout(t);}}
async function fence(api,job){
 if([job.owner_id,job.bot_id,job.id,job.worker_id].some(x=>typeof x!=='string'||!UUID.test(x))||job.signal?.aborted)throw Error('STALE_JOB_LEASE');
 if(!await bounded(api('/rest/v1/rpc/private_bot_access','POST',{subject:job.owner_id})))throw Error('CAPABILITY_DENIED');
 const rows=await bounded(api(`/rest/v1/private_bot_jobs?id=eq.${job.id}&owner_id=eq.${job.owner_id}&bot_id=eq.${job.bot_id}&worker_id=eq.${job.worker_id}&status=eq.running&lease_expires_at=gt.${encodeURIComponent(new Date(Date.now()+30000).toISOString())}&select=*`));
 const row=rows?.[0];
 if(rows?.length!==1||row.id!==job.id||row.owner_id!==job.owner_id||row.bot_id!==job.bot_id||row.worker_id!==job.worker_id||row.status!=='running'||Date.parse(row.lease_expires_at)<=Date.now()+30000||row.message!==job.message||job.signal?.aborted)throw Error('STALE_JOB_LEASE');
 const bots=await bounded(api(`/rest/v1/private_bots?id=eq.${job.bot_id}&owner_id=eq.${job.owner_id}&select=id,owner_id,slot`));
 if(bots?.length!==1||bots[0].id!==job.bot_id||bots[0].owner_id!==job.owner_id||(job.workspace_kind==='echo'?bots[0].slot!==0:!Number.isInteger(bots[0].slot)||bots[0].slot<1||bots[0].slot>10)||job.signal?.aborted)throw Error('STALE_JOB_LEASE');
 // No control-plane route is supplied, even if code asks for one.
 if(/(?:echo|hermes|gateway|provider|credentials?|permissions?|plugins?|cron|operating rules).{0,50}(?:change|modify|edit|update|delete)|(?:change|modify|edit|update|delete).{0,50}(?:echo|hermes|gateway|provider|credentials?|permissions?|plugins?|cron|operating rules)/is.test(row.message))throw Error('CONTROL_PLANE_DENIED');
}
async function transport(request,check,signal){
 await check();
 const child=spawn('/usr/bin/python3',['-I','-S','-B',path.join(__dirname,'private-bot-local-helper.py')],{cwd:__dirname,env:{PATH:'/usr/bin',LANG:'C.UTF-8',TMPDIR:'/home/benecho/.hermes/cache/scratch'},detached:true,stdio:['pipe','pipe','pipe']});
 let chunks=[],size=0,ended=false,error,code;
 const stop=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
 const closed=new Promise(resolve=>{child.on('error',()=>{error=Error('LOCAL_TRANSPORT_UNAVAILABLE');});child.on('close',n=>{code=n;ended=true;resolve();});});
 child.stdout.on('data',b=>{size+=b.length;if(size>3000000){error=Error('LOCAL_OUTPUT_LIMIT');stop();}else chunks.push(b);});
 child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
 signal?.addEventListener('abort',stop,{once:true});
 child.stdin.write(JSON.stringify(request)+'\n');
 const deadline=Date.now()+6000;
 try{
  while(!ended){
   if(signal?.aborted)throw Error('STALE_JOB_LEASE');if(Date.now()>deadline)throw Error('LOCAL_EXECUTION_TIMEOUT');
   await check();if(!ended)child.stdin.write('allow\n');
   await Promise.race([closed,new Promise(r=>setTimeout(r,100))]);
  }
  await closed;if(signal?.aborted)throw Error('STALE_JOB_LEASE');if(error)throw error;if(code!==0)throw Error('LOCAL_SANDBOX_FAILED_CLOSED');await check();
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }finally{stop();await closed;signal?.removeEventListener('abort',stop);child.stdin.destroy();}
}
function createLocalWork({api,checkOutput,save}){
 return async(job,args)=>{
  const {ids,outputs}=validate(args),check=()=>fence(api,job);await check();
  if(/technical|audit|meta.?title|report/i.test(job.message||'')&&!job.toolEvidence)throw Error('SOURCE_EVIDENCE_REQUIRED');
  // Preflight uses the existing canonical article boundary, never a code bypass.
  await checkOutput(job,JSON.stringify({request:job.message,code:args.code}));await check();
  const files={},inputs=[];
  for(const id of ids){
   const rows=await api(`/rest/v1/private_bot_artifacts?id=eq.${id}&owner_id=eq.${job.owner_id}&bot_id=eq.${job.bot_id}&select=id,owner_id,bot_id,name,format,content,binary_base64&limit=1`),r=rows?.[0];
   if(rows?.length!==1||r.id!==id||r.owner_id!==job.owner_id||r.bot_id!==job.bot_id)throw Error('LOCAL_INPUT_DENIED');
   if(!NAME.test(r.name)||r.name.includes('..')||Object.hasOwn(files,r.name)||outputs.some(x=>x.name===r.name))throw Error('INVALID_LOCAL_INPUT');
   const bytes=r.binary_base64?Buffer.from(r.binary_base64,'base64'):Buffer.from(r.content||'');
   // Existing safe parser. No raw generated executable, HTML or ZIP acceptance.
   if(!['txt','md','csv','json'].includes(r.format))throw Error('UNSUPPORTED_LOCAL_INPUT');
   await decodeFile({format:r.format,bytes});
   files[r.name]=bytes.toString('base64');inputs.push({id,name:r.name,format:r.format,sha256:sha(bytes),bytes:bytes.length});
  }
  if(inputs.reduce((n,x)=>n+x.bytes,0)>512000)throw Error('LOCAL_INPUT_LIMIT');await check();
  const operationArgs={code:args.code,codeSha256:sha(args.code),inputs,outputs};
  const response=await durableCall(api,job,'execute_my_local_work',operationArgs,async()=>{
   const binding={owner_id:job.owner_id,bot_id:job.bot_id,id:job.id,worker_id:job.worker_id,workspace_kind:job.workspace_kind==='echo'?'echo':'private_bot'};
   const result=await transport({binding,code:args.code,files},check,job.signal);
   if(!result||Object.keys(result).sort().join()!=='artifacts,stdout'||typeof result.stdout!=='string'||Buffer.byteLength(result.stdout)>64000||!result.artifacts||Array.isArray(result.artifacts)||Object.keys(result.artifacts).sort().join()!==outputs.map(x=>x.name).sort().join())throw Error('INVALID_LOCAL_RESULT');
   const selected=[];
   for(const output of outputs){
    const b64=result.artifacts[output.name];if(typeof b64!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64))throw Error('INVALID_LOCAL_RESULT');
    const bytes=Buffer.from(b64,'base64');await decodeFile({format:output.format,bytes});const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    await checkOutput(job,content);selected.push({...output,content,sha256:sha(bytes)});
   }
   await checkOutput(job,result.stdout);await check();
   return {stdout:result.stdout,selected};
  });
  // Cached execution is data, not authority. Every return/persistence rechecks.
  await check();const artifacts=[];
  for(const output of response.selected){
   await check();
   try{
    const receipt=await save(job,{name:output.name,format:output.format,content:output.content});await check();
    if(!UUID.test(receipt.artifactId||''))throw Error('LOCAL_RECEIPT_INVALID');
    const rows=await api(`/rest/v1/private_bot_artifacts?id=eq.${receipt.artifactId}&owner_id=eq.${job.owner_id}&bot_id=eq.${job.bot_id}&select=id,owner_id,bot_id,name,format,content,binary_base64&limit=1`),r=rows?.[0];
    if(rows?.length!==1||r.id!==receipt.artifactId||r.owner_id!==job.owner_id||r.bot_id!==job.bot_id||r.format!==output.format)throw Error('LOCAL_ARTIFACT_READBACK_FAILED');
    const {encodeFile}=require('./private-bot-files.cjs'),{parseCsv}=require('./private-bot-csv.cjs');
    const expected=await encodeFile({name:output.name,format:output.format,document:output.format==='csv'?{rows:parseCsv(output.content)}:{text:output.content}});
    const bytes=r.binary_base64?Buffer.from(r.binary_base64,'base64'):Buffer.from(r.content||'');
    if(r.name!==expected.name||!bytes.equals(expected.bytes))throw Error('LOCAL_ARTIFACT_READBACK_FAILED');await check();
    artifacts.push({artifactId:r.id,name:r.name,format:r.format,sha256:sha(bytes)});
   }catch(e){await check();return {status:'partial_or_uncertain',artifacts,failedOutput:output.name,error:e.message,replay:'Reconcile/resume receipts only. Never rerun code.'};}
  }
  await check();return {status:'completed',stdout:response.stdout,artifacts};
 };
}
module.exports={createLocalWork,validate,fence,transport};
