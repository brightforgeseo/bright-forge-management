'use strict';
const crypto=require('node:crypto');
const {decodeFile}=require('./private-bot-files.cjs');
function validate(files){
 if(files===undefined)return [];
 if(!Array.isArray(files)||files.length>6)throw Error('INVALID_ATTACHMENTS');let total=0;
 return files.map(x=>{
  if(!x||Object.keys(x).sort().join(',')!=='base64,format,name'||typeof x.name!=='string'||!x.name||x.name.length>180||/[\x00-\x1f/\\]/.test(x.name)||!['txt','md','csv','json','pdf','xlsx','docx'].includes(x.format)||typeof x.base64!=='string'||x.base64.length>2800000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x.base64))throw Error('INVALID_ATTACHMENTS');
  const b=Buffer.from(x.base64,'base64');total+=b.length;if(!b.length||b.length>2097152||total>6291456)throw Error('ATTACHMENT_LIMIT');return {name:x.name,format:x.format,base64:x.base64};
 });
}
function identifier(jobId,index,file){const h=crypto.createHash('sha256').update(JSON.stringify([jobId,index,file])).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
function createAttachments(api){
 async function fence(job){
  if(job.signal?.aborted||!job.id||!job.worker_id||!job.bot_id||!await api('/rest/v1/rpc/private_bot_access','POST',{subject:job.owner_id}))throw Error('CAPABILITY_DENIED');
  const rows=await api(`/rest/v1/private_bot_jobs?id=eq.${job.id}&owner_id=eq.${job.owner_id}&bot_id=eq.${job.bot_id}&worker_id=eq.${job.worker_id}&status=eq.running&lease_expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`);
  if(rows.length!==1)throw Error('STALE_JOB_LEASE');
 }
 async function files(job){
  await fence(job);if(!/^echo:[0-9a-f-]{36}$/.test(job.request_key||''))return [];
  const outer=await api(`/rest/v1/echo_jobs?id=eq.${job.request_key.slice(5)}&requested_by=eq.${job.owner_id}&select=id,requested_by,payload,created_at`);
  if(outer.length!==1)return [];
  let sources=outer;const thread=outer[0].payload?.sessionKey;
  if(typeof thread==='string'&&thread.startsWith(job.owner_id+'-ws-'))sources=await api(`/rest/v1/echo_jobs?requested_by=eq.${job.owner_id}&payload->>sessionKey=eq.${encodeURIComponent(thread)}&created_at=lte.${encodeURIComponent(outer[0].created_at)}&order=created_at.desc&limit=12&select=id,requested_by,payload,created_at`);
  await fence(job); // Source retrieval is asynchronous: recheck requester and lease before exposure.
  return sources.filter(x=>x.requested_by===job.owner_id&&(!thread||x.payload?.sessionKey===thread)).flatMap(x=>validate(x.payload?.attachments).map((f,i)=>({...f,id:identifier(x.id,i,f),created_at:x.created_at,source_file:true,sourceJob:x.id})));
 }
 async function list(job){return (await files(job)).map(({base64,...x})=>x);}
 async function read(job,id){
  const f=(await files(job)).find(x=>x.id===id);if(!f)return null;
  const result=await decodeFile({format:f.format,bytes:Buffer.from(f.base64,'base64')});
  const current=(await files(job)).find(x=>x.id===id);if(!current||JSON.stringify(f)!==JSON.stringify(current))throw Error('ATTACHMENT_SOURCE_CHANGED');
  return {id:f.id,name:f.name,format:f.format,source_file:true,sha256:crypto.createHash('sha256').update(Buffer.from(f.base64,'base64')).digest('hex'),...result};
 }
 return {list,read};
}
module.exports={validate,identifier,createAttachments};
