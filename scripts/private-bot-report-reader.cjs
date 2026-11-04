'use strict';
const fs=require('node:fs'),path=require('node:path'),{digest}=require('./private-bot-client-work.cjs');
function load(){const p=path.join(process.env.HOME,'state/private-bot-grants/business-report-readers.json');const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('REPORT_POLICY_INVALID');return JSON.parse(fs.readFileSync(p,'utf8'));}
function createReportReader({api,google,policy}){
 const readPolicy=()=>policy===undefined?load():typeof policy==='function'?policy():policy;
 async function bind(job){
  const p=readPolicy();if(p.version!==1||JSON.stringify(p.reportTypes)!=='["screaming-frog-issues-v1"]'||!p.roles?.length||p.lanes?.some(x=>!['personal-google','tenxr-google'].includes(x)))throw Error('REPORT_POLICY_INVALID');
  if(job.signal?.aborted||!job.id||!job.bot_id||!job.worker_id||!await api('/rest/v1/rpc/private_bot_access','POST',{subject:job.owner_id}))throw Error('CAPABILITY_DENIED');
  const r=await api(`/rest/v1/profiles?id=eq.${job.owner_id}&select=id,role`);
  if(r.length!==1||r[0].id!==job.owner_id||!p.roles.includes(r[0].role))throw Error('REPORT_ROLE_DENIED');
  const rows=await api(`/rest/v1/private_bot_jobs?id=eq.${job.id}&owner_id=eq.${job.owner_id}&bot_id=eq.${job.bot_id}&worker_id=eq.${job.worker_id}&status=eq.running&lease_expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`);
  if(rows.length!==1||job.signal?.aborted)throw Error('STALE_JOB_LEASE');return {policy:p,role:r[0].role};
 }
 return async(job,args)=>{if(!/^[A-Za-z0-9_-]{20,200}$/.test(args.fileId||'')||args.sheetId!==undefined&&!/^\d{1,12}$/.test(args.sheetId))throw Error('INVALID_TOOL_ARGUMENTS');const before=await bind(job);const value=await google({operation:'business_report_read',arguments:{...args,policy_sha256:digest(before.policy)}});if(JSON.stringify(before)!==JSON.stringify(await bind(job)))throw Error('REPORT_AUTHORITY_CHANGED');return value;};
}
module.exports={createReportReader,load};
