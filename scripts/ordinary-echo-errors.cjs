'use strict';
// No messages, bodies, identities, tokens, causes or retry authority on the wire.
const PHASES=new Set(['request','owner_binding','runtime','ordinary_echo_begin','active','history','google_approval','article_dispatch','article_intake','legacy_history','memory']);
const CODES=new Set(['ORDINARY_PHASE_FAILED','CAPABILITY_DENIED','INVALID_WORK_REQUEST','RUNTIME_SOURCE_DRIFT','STALE_JOB_LEASE','ORDINARY_THREAD_BINDING_REQUIRED','REQUEST_IDENTITY_CONFLICT','OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY','ARTICLE_BOUNDARY_UNAVAILABLE','ARTICLE_SOURCE_GRANT_REQUIRED','ARTICLE_ENGINE_BINDING_REQUIRED','WORK_HISTORY_SCOPE_DENIED']);
const faults=new WeakMap();
function safeFault(error){return faults.get(error)||{version:1,code:CODES.has(error?.message)?error.message:'ORDINARY_PHASE_FAILED',phase:'request',outcome:'unconfirmed',retrySafe:false};}
async function phase(name,fn){
 try{return await fn();}catch(error){
  const code=CODES.has(error?.message)?error.message:'ORDINARY_PHASE_FAILED';
  const clean=new Error(code);faults.set(clean,Object.freeze({version:1,code,phase:PHASES.has(name)?name:'request',outcome:'unconfirmed',retrySafe:false}));throw clean;
 }
}
module.exports={phase,safeFault};
