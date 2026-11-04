'use strict';
// Out-of-band transport evidence, never mixed into Google content or authority.
const evidence=new WeakMap();
function record(value,proof){
 if(!value||typeof value!=='object'||!proof||!Number.isFinite(proof.responseCompletedAt)||!Number.isFinite(proof.requestSentAt)||proof.responseCompletedAt<proof.requestSentAt||proof.responseCompletedAt>Date.now()+1000||proof.status!==200||typeof proof.providerDate!=='string'||!Number.isFinite(Date.parse(proof.providerDate)))throw Error('GOOGLE_PROVIDER_EVIDENCE_INVALID');
 evidence.set(value,Object.freeze({...proof}));return value;
}
function get(value){return evidence.get(value);}
// Injected deterministic test transports have no HTTP envelope. Their await
// completion is the observation. Real transport ALWAYS validates its envelope.
function observedAt(value){return get(value)?.responseCompletedAt??Date.now();}
module.exports={record,get,observedAt};
