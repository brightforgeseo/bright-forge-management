'use strict';
const {spawn}=require('node:child_process');const path=require('node:path');const {StringDecoder}=require('node:string_decoder');
const {PYTHON,isWorkEvidence}=require('./private-bot-agent-tools.cjs');
const STAGES=new Set(['input','client','translate','provider_request','provider_stream','provider_result','tool_emit','tool_reply_wait','tool_reply_received','output','closed','broker_call','journal','tool_reply_write','output_check','timeout','cancelled']);
const CLASSES=new Set(['TimeoutError','APITimeoutError','APIConnectionError','BadRequestError','AuthenticationError','PermissionDeniedError','RateLimitError','InternalServerError','RuntimeError','ValueError','JSONDecodeError','BrokenPipeError','EOFError','OtherError']);
const CODES=new Set(['MODEL_RUNTIME_SOURCE_DRIFT','MODEL_UNAVAILABLE','MODEL_EMPTY_RESPONSE','MODEL_INCOMPLETE_RESPONSE','TOOL_PROTOCOL_MISMATCH','TOOL_BUDGET_EXCEEDED','TOOL_TURN_LIMIT','TOOLS_UNAVAILABLE','MODEL_TIMEOUT','INVALID_TOOL_ARGUMENTS']);
const PROVIDER_CODES=new Set(['invalid_encrypted_content','rate_limit_exceeded','insufficient_quota','invalid_request_error','server_error']);
function runAgentModel({job,messages,broker,onTool=async()=>{},onState=()=>{},spawnModel=spawn,timeoutMs=210000}){
 return new Promise((resolve,reject)=>{
  const parentSignal=job.signal;const controller=new AbortController();job.signal=controller.signal;
  let child,timer,buffer='',stderr='',bytes=0,response=null,chain=Promise.resolve(),calls=0,settled=false,terminalSeen=false,stage='input';const trace=[],seen=new Set();const decoder=new StringDecoder('utf8'),errDecoder=new StringDecoder('utf8');
  function mark(value,detail={}){if(!STAGES.has(value))return;stage=value;const out={stage};if(CLASSES.has(detail.errorClass))out.errorClass=detail.errorClass;if(Number.isInteger(detail.status)&&detail.status>=400&&detail.status<=599)out.status=detail.status;if(CODES.has(detail.code))out.code=detail.code;if(PROVIDER_CODES.has(detail.providerCode))out.providerCode=detail.providerCode;try{onState(out);}catch{}}
  function clean(){clearTimeout(timer);parentSignal?.removeEventListener('abort',cancel);}
  function fail(code){if(settled)return;settled=true;controller.abort();clean();child?.kill('SIGKILL');const error=Error(code);error.stage=stage;error.retrySafe=false;reject(error);}
  function cancel(){mark('cancelled');fail('OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY');}
  if(parentSignal?.aborted){cancel();return;}parentSignal?.addEventListener('abort',cancel,{once:true});
  try{child=spawnModel(PYTHON,[path.join(__dirname,'private-bot-model.py')],{cwd:__dirname,env:Object.fromEntries(['HOME','PATH','LANG','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),stdio:['pipe','pipe','pipe']});}catch{fail('MODEL_UNAVAILABLE');return;}
  timer=setTimeout(()=>fail('OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY'),timeoutMs);
  function send(value){return new Promise((ok,bad)=>{if(settled)return ok();child.stdin.write(JSON.stringify(value)+'\n',error=>error?bad(error):ok());});}
  child.stdout.on('data',chunk=>{
   if(settled)return;bytes+=chunk.length;if(bytes>768000)return fail('MODEL_UNAVAILABLE');buffer+=decoder.write(chunk);
   let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
    chain=chain.then(async()=>{
     if(settled)return;const event=JSON.parse(line);if(terminalSeen)throw Error();
     if(event.event==='completed'){terminalSeen=true;if(typeof event.response!=='string'||!event.response.trim())throw Error();mark('output_check');await broker.checkOutput(job,event.response);if(!settled)response=event.response;return;}
     if(event.event!=='tool_call'||typeof event.callId!=='string'||!event.callId||seen.has(event.callId)||typeof event.name!=='string'||!event.arguments||Array.isArray(event.arguments)||typeof event.arguments!=='object'||++calls>8)throw Error();
     seen.add(event.callId);let result;let success=true;const startedAt=new Date().toISOString();mark('broker_call');
     try{result=await broker.call(job,event.name,event.arguments);if(result?.error)success=false;}catch(error){success=false;result={error:['CAPABILITY_DENIED','INVALID_TOOL_ARGUMENTS','NO_MATCHING_PAID_SERP_RESULT','INVALID_OUTPUT_JSON','SOURCE_EVIDENCE_REQUIRED','ARTICLE_ENGINE_BINDING_REQUIRED','ARTICLE_ARGUMENTS','ARTICLE_EXACT_BINDING_REQUIRED','ARTICLE_SOURCE_GRANT_REQUIRED','ARTICLE_QUEUE_NOT_FOUND','ARTICLE_SOURCE_CHANGED'].includes(error.message)?error.message:'AUTHORISED_TOOL_UNAVAILABLE'};}
     if(settled||controller.signal.aborted)return;
     const entry={callId:event.callId,name:event.name,arguments:(!success?{withheld:true}:event.arguments),startedAt,finishedAt:new Date().toISOString(),success,result};trace.push(entry);
     if(success&&isWorkEvidence(event.name,result))job.toolEvidence=true;
     mark('journal');await onTool(trace);if(!settled){mark('tool_reply_write');await send({callId:event.callId,result});}
    }).catch(()=>fail('OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY'));
   }
  });
  child.stderr.on('data',chunk=>{if(settled)return;stderr+=errDecoder.write(chunk);if(stderr.length>8192){stderr='';return;}let end;while((end=stderr.indexOf('\n'))>=0){const line=stderr.slice(0,end);stderr=stderr.slice(end+1);try{const item=JSON.parse(line);if(item.event==='model_state')mark(item.stage,item);}catch{}}});
  child.stdin.on('error',()=>fail('OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY'));child.on('error',()=>fail('MODEL_UNAVAILABLE'));
  child.on('close',code=>{chain.then(()=>{if(settled)return;buffer+=decoder.end();if(code||buffer.trim()||!response)return fail('OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY');clean();settled=true;resolve({response,toolTrace:trace});}).catch(()=>fail('MODEL_UNAVAILABLE'));});
  send({messages,tools:broker.schemas(job.owner_id),agentProtocol:true}).catch(()=>fail('MODEL_UNAVAILABLE'));
 });
}
module.exports={runAgentModel};
