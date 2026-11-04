'use strict';
// Protected business scope, current task/job authority, no URL-derived grants.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assignedToOwner}=require('./private-bot-sources.cjs');

const {isDeepStrictEqual:equal}=require('node:util');
const emails={'personal-google':'bensocialbeesmedia@gmail.com','tenxr-google':'analytics@10xr.com.au'};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
function load(){const p=path.join(process.env.HOME,'state/private-bot-grants/business-clients.json');try{const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error();const d=JSON.parse(fs.readFileSync(p,'utf8'));if(d.version!==1||!Array.isArray(d.clients))throw Error();return d.clients;}catch(e){if(e.code==='ENOENT')return [];throw Error('BUSINESS_CLIENT_POLICY_INVALID');}}
function validate(s){
 if(!s||!Object.hasOwn(emails,s.lane))throw Error('BUSINESS_CLIENT_POLICY_INVALID');
 if(s.host==null&&(!s.roots?.length||s.gscProperty||s.ga4||s.cms||s.seranking)||s.accessClass!==undefined&&s.accessClass!=='registered-staff')throw Error('BUSINESS_CLIENT_POLICY_INVALID');
 if(s.ga4&&(!/^properties\/[1-9][0-9]*$/.test(s.ga4.property)||!s.ga4.stream?.startsWith(s.ga4.property+'/dataStreams/')||!s.ga4.timeZone))throw Error('BUSINESS_CLIENT_POLICY_INVALID');
 if(s.seranking&&(!Number.isSafeInteger(s.seranking.projectId)||s.seranking.projectId<=0))throw Error('BUSINESS_CLIENT_POLICY_INVALID');
 if(!s||Object.keys(s).some(k=>!['id','name','host','lane','accountEmail','boardId','authority','gscProperty','roots','ga4','seranking','cms','accessClass'].includes(k))||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(s.id)||!s.name||s.host!=null&&!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s.host)||emails[s.lane]!==s.accountEmail||!/^[0-9a-f-]{36}$/i.test(s.boardId)||s.authority?.kind!=='business-registry'||!Array.isArray(s.authority.evidence)||!s.authority.evidence.length||s.authority.evidence.some(e=>typeof e!=='string'||!e)||!Array.isArray(s.roots))throw Error('BUSINESS_CLIENT_POLICY_INVALID');
 if(s.gscProperty!==undefined){let match=s.gscProperty==='sc-domain:'+s.host;if(!match)try{const u=new URL(s.gscProperty);match=['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname==='/'&&u.hostname.replace(/^www\./,'')===s.host;}catch{}if(!match)throw Error('BUSINESS_CLIENT_POLICY_INVALID');}
 for(const r of s.roots)if(!r||Object.keys(r).some(k=>!['id','name','parents','driveId','authority','readTypes'].includes(k))||!/^[A-Za-z0-9_-]{20,200}$/.test(r.id)||!r.name||!Array.isArray(r.parents)||r.parents.some(p=>!/^[A-Za-z0-9_-]{20,200}$/.test(p))||!(r.driveId===null||typeof r.driveId==='string')||r.authority?.kind!=='explicit-business-read-root'||!Array.isArray(r.authority.evidence)||!r.authority.evidence.length)throw Error('BUSINESS_ROOT_AUTHORITY_REQUIRED');
 if(new Set(s.roots.map(r=>r.id)).size!==s.roots.length)throw Error('BUSINESS_CLIENT_POLICY_INVALID');return structuredClone(s);
}
function createClientWork({api,google,scopes}){
 const rows=()=>scopes===undefined?load():typeof scopes==='function'?scopes():scopes;
 async function bind(job,id){
  const matches=rows().filter(s=>s.id===id);if(matches.length!==1)throw Error('BUSINESS_CLIENT_SCOPE_DENIED');const s=validate(matches[0]);
  // This capability can only read a protected client resource. Literal user
  // wording is not write authority; native edits/article production stay separate.
  if(job.signal?.aborted)throw Error('STALE_JOB_LEASE');
  const r=await api('/rest/v1/rpc/private_bot_google_dispatch_authority','POST',{subject:job.owner_id,job_id:job.id,bot:job.bot_id,worker:job.worker_id,board:s.boardId});
  if(job.signal?.aborted||r?.requesterAllowed!==true)throw Error('CAPABILITY_DENIED');if(r.jobAllowed!==true)throw Error('STALE_JOB_LEASE');
  const b=r.board;if(!b||b.id!==s.boardId||b.archived||/paused|cancelled/i.test(b.board_data?.name||''))throw Error('BUSINESS_CLIENT_ASSIGNMENT_REQUIRED');
  const eligible=[];for(const g of b.board_data?.groups||[])for(const t of g.tasks||[])if(assignedToOwner(t.assignedTo,job.owner_id)&&!/paused|cancelled|on hold/i.test(String(t.status||'')))eligible.push(t.id);
  if(!eligible.length&&s.accessClass!=='registered-staff')throw Error('BUSINESS_CLIENT_ASSIGNMENT_REQUIRED');
  const fresh=rows().filter(x=>x.id===id);if(fresh.length!==1||!equal(s,validate(fresh[0])))throw Error('BUSINESS_CLIENT_SCOPE_CHANGED');
  return {scope:s,taskId:eligible.sort()[0]||null};
 }
 async function list(job){const out=[];for(const s of rows()){try{const b=await bind(job,s.id);out.push({id:b.scope.id,name:b.scope.name,lane:b.scope.lane,gscAvailable:!!b.scope.gscProperty,discoveryRoots:b.scope.roots.map(r=>({id:r.id,name:r.name})),discoveryGrantsContentAccess:false});}catch(e){if(!['BUSINESS_CLIENT_ASSIGNMENT_REQUIRED'].includes(e.message))throw e;}}return {clients:out,source:'protected business scopes and current ordinary assignment',unregisteredScopesDenied:true};}
 async function read(job,operation,args){
  const id=['get_gsc_performance','get_ga4_traffic'].includes(operation)?args.site:args.client;const before=await bind(job,id);const s=before.scope;
  if(operation==='get_gsc_performance'&&!s.gscProperty)throw Error('BUSINESS_GSC_SCOPE_REQUIRED');
  if(operation==='get_ga4_traffic'&&!s.ga4)throw Error('BUSINESS_GA4_SCOPE_REQUIRED');
  if(operation==='read_my_seranking_project'&&!s.seranking)throw Error('SERANKING_SCOPE_REQUIRED');
  if(operation==='inspect_my_cms'&&!s.cms)throw Error('CMS_PUBLIC_SCOPE_REQUIRED');
  if(operation==='discover_my_business_sources'&&!s.roots.some(r=>r.id===args.root))throw Error('BUSINESS_ROOT_AUTHORITY_REQUIRED');
  if(operation==='read_my_business_source'&&!s.roots.some(r=>r.id===args.root&&r.readTypes?.includes('document')))throw Error('BUSINESS_ROOT_BODY_AUTHORITY_REQUIRED');
  const operations={get_gsc_performance:'client_gsc_read',get_ga4_traffic:'client_ga4_read',discover_my_business_sources:'client_drive_discovery',read_my_business_source:'client_doc_read',read_my_seranking_project:'client_seranking_read',inspect_my_cms:'client_cms_read'};
  if(!operations[operation])throw Error('BUSINESS_READ_OPERATION_DENIED');
  const request={operation:operations[operation],arguments:{...args,client:id,scope_sha256:digest(s)}};
  const result=await google(request);
  if(!equal(before,await bind(job,id)))throw Error('BUSINESS_CLIENT_SCOPE_CHANGED');return result;
 }
 return {list,read};
}
module.exports={createClientWork,load,validate,digest};
