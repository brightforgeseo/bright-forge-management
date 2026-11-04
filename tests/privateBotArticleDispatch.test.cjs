'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dispatchArticle,parseDispatchCommand}=require('../scripts/private-bot-article-dispatch.cjs');
const owner='owner',source='12345678901234567890';
const binding={programme:'brightforge-clients',jobId:'123',client:'Client',source,tab:'October',cell:'D5'};
const grants=[{owner,boardId:'board',source,client:'Client'}];
const boards=[{id:'board',board_data:{groups:[{tasks:[{id:'task',assignedTo:owner,clientSheet:`https://docs.google.com/spreadsheets/d/${source}/edit`}]}]}}];
const api=async(url)=>url.includes('private_bot_access')?true:boards;
const job={owner_id:owner,id:'request',bot_id:'bot',worker_id:'worker'};
const read=async()=>({...binding,status:'queued',proofVerified:false});
test('fresh dispatch reaches persistent queue with trusted identity, not instructions',async()=>{
 let request;
 const r=await dispatchArticle(job,api,{action:'write',...binding},{read,grants,queue:async v=>(request=v,{status:'pending',requestId:'queue-id'})});
 assert.equal(r.status,'pending');assert.equal(request.owner,owner);assert.equal(request.portalJob,'request');assert.equal(request.binding.cell,'D5');assert.equal(request.action,'write');assert.ok(!Object.hasOwn(request,'instructions'));
});
test('cross-owner, wrong source/client/cell/programme and injected keys rejected before queue',async()=>{
 for(const args of [{...binding,source:'unknown'},{...binding,client:'Other'},{...binding,cell:'D6'},{...binding,programme:'10xr'},{...binding,command:'rm'}]){
 await assert.rejects(dispatchArticle(job,api,{action:'write',...args},{read,grants,queue:()=>{throw Error('MUST_NOT_QUEUE');}}),e=>e.message!=='MUST_NOT_QUEUE');
 }
 await assert.rejects(dispatchArticle({...job,owner_id:'foreign'},api,{action:'write',...binding},{read,grants}),/ARTICLE_SOURCE_GRANT_REQUIRED/);
});
test('accepted jobs cannot be reopened or counted as new writing',async()=>{
 const r=await dispatchArticle(job,api,{action:'repair',...binding},{read:async()=>({...await read(),status:'handoff_verified',proofVerified:true}),grants,queue:()=>{throw Error('MUST_NOT_QUEUE');}});
 assert.equal(r.status,'held');assert.equal(r.code,'ACCEPTED_JOB_IMMUTABLE');
});
test('full typed request through persistent queue and actual driver into fixture engine stages',async()=>{
 const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto'),path=require('node:path');
 const user=randomUUID(),bound={...binding,client:'CONTROLLED QA FIXTURE'},g=[{...grants[0],owner:user,client:bound.client}],b=[{...boards[0],board_data:{groups:[{tasks:[{id:'task',assignedTo:user,clientSheet:`https://docs.google.com/spreadsheets/d/${source}/edit`}]}]}}];
 const actual=await dispatchArticle({owner_id:user,id:randomUUID(),bot_id:randomUUID()},async url=>url.includes('private_bot_access')?true:b,{action:'write',...bound},{read:async()=>({...bound,status:'queued',proofVerified:false}),grants:g,queue:async v=>JSON.parse(execFileSync('/usr/bin/python3',[path.join(__dirname,'private_bot_article_e2e_fixture.py')],{input:JSON.stringify(v),encoding:'utf8'}))});
 assert.equal(actual.status,'completed');assert.equal(actual.label,'CONTROLLED_QA_ONLY_NOT_REAL_CLIENT_DELIVERY');assert.equal(actual.kernelLockCheckedAtEveryStage,true);assert.equal(actual.realGoogleWrites,0);assert.deepEqual(actual.stages,['writer','review','fix','targeted','freeze','upload','vision','finish']);
});
test('explicit dispatch command preserves all exact identity fields',()=>{
 assert.deepEqual(parseDispatchCommand('/article write '+JSON.stringify(binding)),{action:'write',...binding});
 assert.equal(parseDispatchCommand('quoted /article write '+JSON.stringify(binding)),null);
 assert.throws(()=>parseDispatchCommand('/article write '+JSON.stringify({...binding,owner:'foreign'})),/ARTICLE_ARGUMENTS/);
});
