'use strict';
const {createHash}=require('node:crypto');
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function operationId(name,args){const stable={...args};if(name==='save_output')delete stable.binary_base64;return createHash('sha256').update(name+'\n'+JSON.stringify(canonical(stable))).digest('hex');}
function operationClient(api,job){
 if(!job.id||!job.worker_id||!job.owner_id)throw Error('STALE_JOB_LEASE');
 return async(op,name,args,phase,result=null)=>{
  if(job.signal?.aborted)throw Error('STALE_JOB_LEASE');
  return api('/rest/v1/rpc/private_bot_operation','POST',{subject:job.owner_id,job:job.id,worker:job.worker_id,op,operation:name,arguments:args,phase,result});
 };
}
async function durableCall(api,job,name,args,perform){
 const op=operationId(name,args),call=operationClient(api,job);
 const started=await call(op,name,args,'begin');
 if(Object.hasOwn(started,'receipt'))return started.receipt;
 const result=await perform();
 if(job.signal?.aborted)throw Error('OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY');
 return (await call(op,name,args,'finish',result)).receipt;
}
module.exports={operationId,operationClient,durableCall};
