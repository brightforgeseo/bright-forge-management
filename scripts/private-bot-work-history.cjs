'use strict';
const fs=require('node:fs'),path=require('node:path');
const {digest}=require('./private-bot-client-work.cjs');
function load(){const p=path.join(process.env.HOME,'state/private-bot-grants/work-history.json');try{const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077)||st.size>256000)throw Error();const d=JSON.parse(fs.readFileSync(p,'utf8'));if(d.version!==1||!Array.isArray(d.subjects))throw Error();return d.subjects;}catch(e){if(e.code==='ENOENT')return [];throw Error('WORK_HISTORY_POLICY_INVALID');}}
function createWorkHistory({api,google,subjects}){
 const rows=()=>subjects===undefined?load():typeof subjects==='function'?subjects():subjects;
 const scope=owner=>{const found=rows().filter(s=>s.ownerId===owner);if(found.length!==1||found[0].kind!=='reviewed-own-work-turns')throw Error('WORK_HISTORY_SCOPE_DENIED');return structuredClone(found[0]);};
 async function fence(job){if(job.signal?.aborted)throw Error('STALE_JOB_LEASE');const r=await api('/rest/v1/rpc/private_bot_google_dispatch_authority','POST',{subject:job.owner_id,job_id:job.id,bot:job.bot_id,worker:job.worker_id,board:null});if(job.signal?.aborted||r?.requesterAllowed!==true)throw Error('CAPABILITY_DENIED');if(r.jobAllowed!==true)throw Error('STALE_JOB_LEASE');}
 return async(job,args)=>{if(Object.keys(args).join()!=='query'||typeof args.query!=='string'||args.query.length>200)throw Error('WORK_HISTORY_ARGUMENTS_DENIED');await fence(job);const before=scope(job.owner_id);const result=await google({operation:'work_history_read',arguments:{owner_id:job.owner_id,scope_sha256:digest(before),query:args.query}});await fence(job);if(digest(before)!==digest(scope(job.owner_id)))throw Error('WORK_HISTORY_SCOPE_CHANGED');return result;};
}
module.exports={createWorkHistory,load};
