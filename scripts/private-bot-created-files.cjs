'use strict';
// Protected server ledger, not Drive markers or caller-supplied IDs, is authority.
const {isDeepStrictEqual:equal}=require('node:util');
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const lineage=x=>({id:x.id,name:x.name,mimeType:x.mimeType,parents:x.parents||[],driveId:x.driveId||null,trashed:!!x.trashed});
// Same-child evidence retains permission IDs and inheritance details. Only UI
// decorations are non-authoritative. Folder inheritance is NOT a child baseline.
const acl=xs=>xs.map(({photoLink,displayName,...x})=>x).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
function createCreatedFiles({store,context,send,sourceBinding,sourceSnapshot,sourceCurrent,sourceAdmission}){
 const cache=new Map();
 function record(owner,id){
  const rows=Object.entries(store.read().businessExports||{}).filter(([op,r])=>r.createdId===id);
  if(!rows.length)return null;
  const job=context();if(rows.length!==1||!job||job.owner_id!==owner||!job.bot_id)throw Error('GOOGLE_CREATED_WORKSPACE_DENIED');
  const [op,r]=rows[0],b=r.operationBinding;
  if(r.state!=='complete'||r.owner!==owner||b?.owner!==owner||b.bot!==job.bot_id||hash(b)!==op||b.source!==r.source||b.folder!==r.destination?.folder||b.subject!==r.binding?.subject||r.artifactBinding?.id!==b.artifact||r.artifactBinding.contentHash!==b.content||r.receipt?.fileId!==id||r.receipt.operationId!==op||r.receipt.contentReadback!==true||r.receipt.aclPreserved!==true||!r.sourceBaseline||!r.folderBaseline||!Array.isArray(r.folderAcl)||r.source===id)throw Error('GOOGLE_CREATION_PROVENANCE_REQUIRED');
  return {op,r};
 }
 function materialise(id,op,r,b){
  if(!b||!equal(b,r.binding))throw Error('GOOGLE_CREATED_SOURCE_REVOKED');
  return {...b,source:id,resourcePolicy:{scope:{file:true},operations:['read','native'],authority:{kind:'protected-created-work',evidence:[op]},...(b.resourcePolicy?.nativeRoot?{nativeRoot:b.resourcePolicy.nativeRoot}:{}),createdFile:{operation:op,source:r.source,folder:r.destination.folder,owner:r.owner,bot:r.operationBinding.bot}}};
 }
 async function binding(owner,id,{fresh=false}={}){
  const entry=record(owner,id);if(!entry)return null;const {op,r}=entry;
  // Do not traverse child-created chains or use an orphan's Google ACL as a grant.
  if(Object.values(store.read().businessExports||{}).some(x=>x.createdId===r.source))throw Error('GOOGLE_CREATED_CHAIN_UNSUPPORTED');
  if(!Array.isArray(r.childAcl)||!r.childAcl.length)throw Error('GOOGLE_CREATED_CHILD_ACL_REQUIRED');
  const identity=()=>{const j=context();return j&&{owner:j.owner_id,bot:j.bot_id,job:j.id,worker:j.worker_id}};
  const identityBefore=identity(),key=owner+':'+id,prior=cache.get(key);
  const current=()=>sourceCurrent?sourceCurrent(owner,r.source):sourceBinding(owner,r.source);
  // Reuse provider evidence only within this exact job/worker. Authority is
  // revalidated on every use; no stale grant/account/ledger or lease is cached.
  if(!fresh&&prior&&Date.now()-prior.completedAt<1000&&Date.now()-prior.observedAt<2000&&equal(prior.entry,entry)&&equal(prior.identity,identityBefore)){
   const b=await current();if(!equal(b,prior.b)||!equal(entry,record(owner,id))||!equal(identityBefore,identity()))throw Error('GOOGLE_CREATED_SOURCE_REVOKED');
   if(Date.now()-prior.observedAt>=2000)throw Error('GOOGLE_CREATED_PROOF_STALE');
   return materialise(id,op,r,b);
  }
  const admitted=await (sourceAdmission?sourceAdmission(owner,r.source,r):sourceBinding(owner,r.source,{fresh}));
  const out=materialise(id,op,r,admitted),b=admitted,requests=new Map(),observations=[];
  const get=(fileId,suffix='')=>{const url=`https://www.googleapis.com/drive/v3/files/${fileId}${suffix||'?supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,trashed,capabilities(canEdit,canAddChildren),appProperties'}`;if(!requests.has(url))requests.set(url,send({lane:b.lane,fileId,method:'GET',url}).then(v=>{observations.push(require('./private-bot-provider-evidence.cjs').observedAt(v));return v}));return requests.get(url)};
  const readAcl=async()=>{const permissions=[],seen=new Set();let page;do{const v=await get(id,'/permissions?supportsAllDrives=true&pageSize=100&fields=nextPageToken,permissions(id,type,role,emailAddress,domain,allowFileDiscovery,expirationTime,deleted,pendingOwner,permissionDetails)'+(page?'&pageToken='+encodeURIComponent(page):''));if(!Array.isArray(v.permissions)||permissions.length+v.permissions.length>1000||v.nextPageToken&&seen.has(v.nextPageToken))throw Error('GOOGLE_ACL_BASELINE_REQUIRED');permissions.push(...v.permissions);page=v.nextPageToken;if(page)seen.add(page);}while(page);return permissions};
  // All child evidence shares one bounded async observation. Source authority
  // was admitted first and is revalidated without another provider round trip.
  const [source,child,folder,permissions,authorised]=await Promise.all([get(r.source),get(id),get(r.destination.folder),readAcl(),sourceAdmission?sourceBinding(owner,r.source,{fresh:true}):Promise.resolve(admitted)]);
  // Age the oldest COMPLETED provider observation, not process start. This
  // includes every ACL page; slow delivery cannot renew an old HTTP response.
  const observedAt=Math.min(...observations);
  if(!equal(authorised,b))throw Error('GOOGLE_CREATED_SOURCE_REVOKED');
  if(!equal(lineage(source),lineage(r.sourceBaseline))||!equal(lineage(folder),lineage(r.folderBaseline))||folder.capabilities?.canAddChildren!==true||child.id!==id||child.trashed||!equal(child.parents,[folder.id])||!equal(child.driveId||null,folder.driveId||null)||child.name!==r.artifactBinding.name.replace(/\.[^.]+$/,'')||child.appProperties?.privateBotOperation!==op||child.mimeType!==('application/vnd.google-apps.'+(['xlsx','csv'].includes(r.artifactBinding.format)?'spreadsheet':'document'))||child.capabilities?.canEdit!==true)throw Error('GOOGLE_CREATED_LINEAGE_CHANGED');
  if(!equal(acl(permissions),acl(r.childAcl)))throw Error('GOOGLE_CREATED_ACL_CHANGED');
  if(!equal(entry,record(owner,id))||!equal(b,await current())||!equal(identityBefore,identity()))throw Error('GOOGLE_CREATED_SOURCE_REVOKED');
  if(Date.now()-observedAt>=2000)throw Error('GOOGLE_CREATED_PROOF_STALE');
  cache.set(key,{entry,b,out,identity:identityBefore,observedAt,completedAt:Date.now()});return out;
 }
 function snapshot(owner,id,boards){const entry=record(owner,id);if(!entry)return null;const p=cache.get(owner+':'+id);const j=context();if(!p||Date.now()-p.observedAt>=2000||!equal(p.entry,entry)||!equal(p.identity,{owner:j?.owner_id,bot:j?.bot_id,job:j?.id,worker:j?.worker_id}))throw Error('GOOGLE_CREATED_PROOF_STALE');return materialise(id,entry.op,entry.r,sourceSnapshot(owner,entry.r.source,boards));}
 return {binding,snapshot,known:id=>Object.values(store.read().businessExports||{}).some(r=>r.createdId===id)};
}
module.exports={createCreatedFiles};
