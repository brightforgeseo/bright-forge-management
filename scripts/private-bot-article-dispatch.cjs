'use strict';
// Trusted service boundary. No caller-supplied command, path, account or prose.
const {execFile}=require('node:child_process');
const path=require('node:path');
const {authorisedSource,readCanonical}=require('./private-bot-article-adapter.cjs');
const fields=['programme','jobId','client','source','tab','cell'];
function validate(args){
 if(!args||Array.isArray(args)||typeof args!=='object'||Object.keys(args).sort().join()!==['action',...fields].sort().join())throw Error('ARTICLE_ARGUMENTS');
 if(!['write','repair','status'].includes(args.action)||!['10xr','brightforge-clients'].includes(args.programme)||! /^[1-9][0-9]{0,15}$/.test(args.jobId))throw Error('ARTICLE_ARGUMENTS');
 for(const k of fields)if(typeof args[k]!=='string'||!args[k]||args[k].length>200||/[\x00-\x1f]/.test(args[k]))throw Error('ARTICLE_ARGUMENTS');
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(args.source)||! /^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(args.cell))throw Error('ARTICLE_ARGUMENTS');
 return args;
}
function parseDispatchCommand(message){
 const m=/^\/article (write|repair|status) (\{[^\n]+\})$/.exec(message||'');
 if(!m)return null;
 let value;try{value=JSON.parse(m[2]);}catch{throw Error('ARTICLE_ARGUMENTS');}
 if(!value||Object.hasOwn(value,'action'))throw Error('ARTICLE_ARGUMENTS');
 return validate({action:m[1],...value});
}
function queueRequest(payload){return new Promise((resolve,reject)=>{
 // Preserve an explicit principal refusal rather than stripping/overriding it.
 if(process.env.ECHO_EXECUTION_PRINCIPAL!==undefined)return reject(Error('ARTICLE_SERVICE_PRINCIPAL_REQUIRED'));
 const child=execFile('/usr/bin/python3',[path.join(__dirname,'private-bot-article-queue.py')],{timeout:20000,maxBuffer:24000,env:Object.fromEntries(['HOME','PATH','LANG','TMPDIR','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_INTERNAL_URL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))},(error,out)=>{
  try{const result=JSON.parse(out);if(result.error)throw Error(result.error);if(error)throw error;resolve(result);}catch(e){reject(Error(/^ARTICLE_[A-Z_]+$/.test(e.message)?e.message:'ARTICLE_QUEUE_UNAVAILABLE'));}
 });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
});}
async function dispatchArticle(job,api,args,{read=readCanonical,grants,queue=queueRequest}={}){
 validate(args);
 if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:job.owner_id}))throw Error('ARTICLE_SOURCE_GRANT_REQUIRED');
 const proof=await read({programme:args.programme,jobId:args.jobId});
 if(fields.some(k=>proof[k]!==args[k]))throw Error('ARTICLE_EXACT_BINDING_REQUIRED');
 const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');
 const grant=authorisedSource(boards,job.owner_id,args.source,grants);
 if(!grant||grant.client!==args.client)throw Error('ARTICLE_SOURCE_GRANT_REQUIRED');
 if(args.action!=='status'&&proof.status==='handoff_verified')return {status:'held',code:'ACCEPTED_JOB_IMMUTABLE',newDelivery:false};
 if(job.signal?.aborted)throw Error('STALE_JOB_LEASE');
 return queue({action:args.action,owner:job.owner_id,portalJob:job.id,bot:job.bot_id,binding:Object.fromEntries(fields.map(k=>[k,args[k]])),grant:{boardId:grant.boardId,taskId:grant.taskId}});
}
async function dispatchRoute(job,api,options){
 const args=parseDispatchCommand(job.message);if(!args)return null;
 const result=await dispatchArticle(job,api,args,options);
 return {response:`Article engine request: ${result.status}. ${result.code||''}\n${args.client}, job ${args.jobId}, ${args.tab}!${args.cell}.\n${result.requestId?'Queue receipt: '+result.requestId+'. ':''}Queued is not running, and a finished request is not article delivery. No article prose or unverified destination was exposed. Check the same binding with /article status followed by the same JSON. Accepted links remain available through /article PROGRAMME JOB_ID.`,proof:{...result,engineDispatch:true,proofVerified:false}};
}
module.exports={validate,parseDispatchCommand,dispatchArticle,dispatchRoute,queueRequest};
