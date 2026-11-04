'use strict';
const {authorisedSource}=require('./private-bot-article-adapter.cjs');
const {isDeepStrictEqual:equal}=require('node:util');
const {ordinaryIntent}=require('./private-bot-native-intent.cjs');
function ordinary(boards,grant,job){
 if(grant.resourcePolicy?.nativeRoot||grant.resourcePolicy?.createdFile){
  if(!grant.resourcePolicy.operations.includes('native'))throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');
  if(job&&!ordinaryIntent(job.message))throw Error('GOOGLE_ORDINARY_TASK_REQUIRED');
  return;
 }
 if(!grant.boardId&&grant.resourcePolicy?.authority.kind==='authenticated-direct-work'){
  if(!grant.resourcePolicy.operations.includes('native'))throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');
  if(job&&!ordinaryIntent(job.message))throw Error('GOOGLE_ORDINARY_TASK_REQUIRED');
  return;
 }
 const board=boards.find(b=>b.id===grant.boardId);let hits=0;
 for(const group of board?.board_data?.groups||[])for(const task of group.tasks||[])if(task.id===grant.taskId){
  hits++;
  // Comment authors are attribution, not work instructions. Keep every other
  // task/comment field in the existing conservative classifier, including text,
  // descriptions, status and unknown fields. Never mutate the board snapshot.
  const inspected={...task};
  if(Array.isArray(task.comments))inspected.comments=task.comments.map(comment=>{
   if(!comment||typeof comment!=='object'||Array.isArray(comment))return comment;
   const copy={...comment};if(typeof copy.author==='string')delete copy.author;return copy;
  });
  if(/article|content.?engine|echo|hermes|credential|publish|send|cancelled|paused/i.test(JSON.stringify([board.board_data.name,group.title,group.name,inspected])))throw Error('GOOGLE_ORDINARY_TASK_REQUIRED');
 }
 if(hits!==1)throw Error('GOOGLE_ORDINARY_TASK_REQUIRED');
}
// All mutable database facts arrive in ONE database statement snapshot. No
// awaited reads after this response. Local grant/account state is read afresh
// synchronously before returning to the dispatch call in the same JS turn.
async function dispatchAuthority({api,job,fileId,expectedGrant,expectedSubject,business,store,grants}){
 // All nested asynchronous validators have finished. Refresh root/source
 // provider evidence once, then take the final atomic DB authority snapshot.
 // snapshot() rejects evidence which aged out during that last RPC. There are
 // no asynchronous operations after the RPC, and no deadline is extended.
 if(expectedGrant.resourcePolicy?.nativeRoot||expectedGrant.resourcePolicy?.createdFile){
  const fresh=await business.refreshDispatchBinding(job.owner_id,fileId);
  if(!fresh)throw Error('GOOGLE_TARGET_NOT_ASSIGNED');
 }
 const r=await api('/rest/v1/rpc/private_bot_google_dispatch_authority','POST',{subject:job.owner_id,job_id:job.id,bot:job.bot_id,worker:job.worker_id,board:expectedGrant.boardId});
 if(job.signal?.aborted||r?.requesterAllowed!==true)throw Error('CAPABILITY_DENIED');
 if(r.jobAllowed!==true)throw Error('STALE_JOB_LEASE');
 const boards=r.board?[r.board]:[];const binding=business.bindingSnapshot(job.owner_id,fileId,boards);
 const g=binding||authorisedSource(boards,job.owner_id,fileId,grants);
 if(!g)throw Error('GOOGLE_TARGET_NOT_ASSIGNED');
 const grant={...g};delete grant.lane;delete grant.subject;
 if(!equal(grant,expectedGrant))throw Error('GOOGLE_TARGET_NOT_ASSIGNED');ordinary(boards,grant,job);
 const subject=binding?.subject||store.read().accounts?.[job.owner_id]?.sub;
 if(!subject||subject!==expectedSubject)throw Error('GOOGLE_SELF_LINK_REQUIRED');
 return true;
}
module.exports={dispatchAuthority,ordinary};
