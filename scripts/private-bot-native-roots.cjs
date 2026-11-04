'use strict';
// Separate explicit normal-work authorisation. Read roots alone NEVER grant edits.
// Only direct native children of qualified dedicated business roots; no shortcuts,
// recursive/global ownership grant, task URL, individual OAuth or account fallback.
const fs=require('node:fs'),path=require('node:path');
const {load:loadScopes,validate,digest}=require('./private-bot-client-work.cjs');
const {assignedToOwner}=require('./private-bot-sources.cjs');
const {isDeepStrictEqual:equal}=require('node:util');
const {ordinaryIntent}=require('./private-bot-native-intent.cjs');
const CLASS='ordinary-client-native-v1';
// Reuse metadata evidence, NEVER requester/job/assignment/policy authority.
// Final dispatch always refreshes it; a delayed final DB snapshot fails closed.
const REUSE_MS=1000,DISPATCH_PROOF_MS=2000;
const OPS=['doc_replace','doc_rewrite','doc_runs','sheet_values','sheet_cells','create_document','create_spreadsheet'];
const blocked=/\b(credentials?|passwords?|secrets?|payments?|payroll|financial|mortgage|banking|private|personal|gerry|hermes|articles?)\b/i;
function loadPolicy(){const p=path.join(process.env.HOME,'state/private-bot-grants/business-native-work.json');try{const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error();return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('GOOGLE_NATIVE_ROOT_POLICY_INVALID');}}
function createRootAuthority({api,send,clientScopes,nativePolicy}){
 const scopes=()=>clientScopes===undefined?loadScopes():typeof clientScopes==='function'?clientScopes():clientScopes;
 const policy=()=>nativePolicy===undefined?loadPolicy():typeof nativePolicy==='function'?nativePolicy():nativePolicy;
 const cache=new Map();
 function candidates(owner,boards){
  const p=policy();if(!p)return [];
  if(p.version!==1||p.workClass!==CLASS||p.authority?.kind!=='ben-explicit-normal-work'||!p.authority.evidence?.length||!Array.isArray(p.roots))throw Error('GOOGLE_NATIVE_ROOT_POLICY_INVALID');
  if(new Set(p.roots.map(x=>x.client+':'+x.root)).size!==p.roots.length)throw Error('GOOGLE_NATIVE_ROOT_POLICY_INVALID');
  const result=[];
  for(const entry of p.roots){
   if(Object.keys(entry).sort().join(',')!=='client,operations,root,scopeSha256'||!Array.isArray(entry.operations)||!entry.operations.length||entry.operations.some(x=>!OPS.includes(x)))throw Error('GOOGLE_NATIVE_ROOT_POLICY_INVALID');
   const hits=scopes().filter(x=>x.id===entry.client);if(hits.length!==1)continue;const s=validate(hits[0]);
   if(digest(s)!==entry.scopeSha256)continue;
   const r=s.roots.find(x=>x.id===entry.root);if(!r||blocked.test(r.name)||!r.readTypes?.length)continue;
   const b=boards.find(x=>x.id===s.boardId&&!x.archived&&x.board_data?.name===s.name&&!/paused|cancelled|on hold/i.test(JSON.stringify([x.board_data?.name,x.board_data?.status])));if(!b)continue;
   const tasks=(b.board_data.groups||[]).flatMap(g=>(g.tasks||[]).filter(t=>assignedToOwner(t.assignedTo,owner)&&!/paused|cancelled|on hold/i.test(String(t.status||''))&&ordinaryIntent([g.title,g.name,t.title,t.description].filter(x=>typeof x==='string').join('\n'))));
   if(!tasks.length&&s.accessClass!=='registered-staff')continue;
   result.push({scope:s,root:r,entry,taskId:tasks.map(t=>t.id).sort()[0]||null,policyHash:digest(p)});
  }return result;
 }
 const meta=(lane,id)=>send({lane,fileId:id,method:'GET',url:`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,trashed,capabilities(canEdit,canAddChildren)`});
 function materialise(owner,fileId,c,m,f){
  const type=m.mimeType?.replace('application/vnd.google-apps.','');
  if(fileId===c.root.id){
   if(m.id!==fileId||m.trashed||type!=='folder'||m.name!==c.root.name||!equal(m.parents||[],c.root.parents)||!equal(m.driveId||null,c.root.driveId)||m.capabilities?.canAddChildren!==true)return null;
   return {boardId:c.scope.boardId,taskId:c.taskId,source:fileId,client:c.scope.name,lane:c.scope.lane,subject:'business:'+c.scope.lane+':'+c.scope.accountEmail,resourcePolicy:{scope:{file:true},operations:['native'],authority:{kind:CLASS,evidence:[...c.scope.authority.evidence,'protected output root:'+c.policyHash]},nativeRoot:{client:c.scope.id,folder:fileId,scopeSha256:digest(c.scope),policyHash:c.policyHash,operations:c.entry.operations,canAddChildren:true,destinationOnly:true}}};
  }
  if(m.id!==fileId||m.trashed||!['document','spreadsheet'].includes(type)||!c.root.readTypes.includes(type)||m.parents?.length!==1||m.parents[0]!==c.root.id||blocked.test(m.name||'')||f.id!==c.root.id||f.trashed||f.mimeType!=='application/vnd.google-apps.folder'||f.name!==c.root.name||!equal(f.parents||[],c.root.parents)||!equal(f.driveId||null,c.root.driveId)||!equal(m.driveId||null,c.root.driveId))return null;
  // A spreadsheet requires explicit spreadsheet qualification, not document roots.
  const native=m.capabilities?.canEdit===true;
  const operations=native?['read','native']:['read'];
  return {boardId:c.scope.boardId,taskId:c.taskId,source:fileId,client:c.scope.name,lane:c.scope.lane,subject:'business:'+c.scope.lane+':'+c.scope.accountEmail,resourcePolicy:{scope:{file:true},operations,authority:{kind:CLASS,evidence:[...c.scope.authority.evidence,'explicit protected native work policy:'+c.policyHash]},nativeRoot:{client:c.scope.id,folder:c.root.id,scopeSha256:digest(c.scope),policyHash:c.policyHash,operations:c.entry.operations,canAddChildren:f.capabilities?.canAddChildren===true}}};
 }
 function snapshot(owner,fileId,boards){const prior=cache.get(owner+':'+fileId);if(!prior||Date.now()-prior.observedAt>DISPATCH_PROOF_MS)return null;const c=candidates(owner,boards).find(x=>equal(x,prior.c));return c?materialise(owner,fileId,c,prior.m,prior.f):null;}
 async function binding(owner,fileId,{fresh=false}={}){
  if(!policy())return null;
  if(!/^[A-Za-z0-9_-]{20,200}$/.test(fileId))throw Error('INVALID_GOOGLE_FILE');
  if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
  const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');if(boards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
  const cs=candidates(owner,boards),prior=cache.get(owner+':'+fileId);let found=null;
  // Candidate set equality includes owner assignment, scope, lane, policy and
  // root qualification. Do not reuse a proof across new competing candidates.
  if(!fresh&&prior&&Date.now()-prior.completedAt<REUSE_MS&&Date.now()-prior.observedAt<DISPATCH_PROOF_MS&&equal(cs,prior.candidates))found=prior;
  for(const lane of found?[]:new Set(cs.map(c=>c.scope.lane))){
   let m;try{m=await meta(lane,fileId)}catch{continue;}
   const sourceObservedAt=require('./private-bot-provider-evidence.cjs').observedAt(m);
   for(const c of cs.filter(c=>c.scope.lane===lane&&(fileId===c.root.id||m.parents?.length===1&&m.parents[0]===c.root.id))){
    const f=fileId===c.root.id?m:await meta(lane,c.root.id),b=materialise(owner,fileId,c,m,f);if(!b)continue;if(found)throw Error('GOOGLE_BUSINESS_LANE_AMBIGUOUS');found={b,c,m,f,observedAt:Math.min(sourceObservedAt,require('./private-bot-provider-evidence.cjs').observedAt(f)),completedAt:Date.now(),candidates:structuredClone(cs)};
   }
  }
  // Recheck async changes before returning any capability or caching the proof.
  if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
  const freshBoards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');if(freshBoards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
  if(found){const current=candidates(owner,freshBoards).find(c=>equal(c,found.c));if(!current)throw Error('GOOGLE_NATIVE_ROOT_REVOKED');cache.set(owner+':'+fileId,found);return found.b;}
  cache.delete(owner+':'+fileId);return null;
 }
 // Metadata-only admission against protected retained lineage. This checks
 // current policy/assignment before the coherent parallel provider observation;
 // it never supplies a final proof or authorises content/mutation by itself.
 function admission(owner,fileId,boards,source,folder){const matches=candidates(owner,boards).map(c=>materialise(owner,fileId,c,source,folder)).filter(Boolean);if(matches.length>1)throw Error('GOOGLE_BUSINESS_LANE_AMBIGUOUS');return matches[0]||null;}
 return {binding,snapshot,admission};
}
module.exports={createRootAuthority,CLASS,OPS};
