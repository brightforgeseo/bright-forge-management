const test=require('node:test'),assert=require('node:assert/strict');const {createAgentToolBroker}=require('../scripts/private-bot-agent-tools.cjs');
const owner='a1e57188-a322-42b2-9d33-b5df08033685',job={owner_id:owner,bot_id:'11111111-1111-4111-8111-111111111111',id:'job-fixture',worker_id:'worker-fixture'};
test('client work output read is bound to exact owner and bot, not arbitrary paths',async()=>{
 const calls=[];const b=createAgentToolBroker({api:async(...a)=>{calls.push(a);if(a[0].endsWith('private_bot_operation'))return a[2].phase==='begin'?{started:true}:{receipt:a[2].result};return a[0].includes('private_bot_access')?true:[{id:'22222222-2222-4222-8222-222222222222',format:'txt',content:'verified private file'}];}});
 const r=await b.call(job,'read_my_output',{artifact_id:'22222222-2222-4222-8222-222222222222'});assert.equal(r.text,'verified private file');const read=calls.find(c=>c[0].includes('/private_bot_artifacts?'));
 assert.ok(read[0].includes('owner_id=eq.'+owner));assert.ok(read[0].includes('bot_id=eq.'+job.bot_id));await assert.rejects(b.call(job,'read_my_output',{artifact_id:'../../.hermes/config.yaml'}),/INVALID_TOOL_ARGUMENTS/);
});
test('ordinary task date write uses atomic worker-fenced receipt RPC; extra args denied',async()=>{
 const calls=[];const b=createAgentToolBroker({api:async(...a)=>{calls.push(a);return {receipt:{updated:true}};}});
 const result=await b.call(job,'update_my_task_due_date',{board_id:job.bot_id,task_id:'qa',expected_date:'',due_date:'2026-10-20'});assert.equal(result.updated,true);assert.equal(calls.length,1);assert.equal(calls[0][0],'/rest/v1/rpc/private_bot_operation');assert.equal(calls[0][2].subject,owner);assert.equal(calls[0][2].worker,job.worker_id);assert.equal(calls[0][2].job,job.id);assert.deepEqual(calls[0][2].arguments,{board_id:job.bot_id,task_id:'qa',expected:'',value:'2026-10-20'});
 await assert.rejects(b.call(job,'update_my_task_due_date',{board_id:job.bot_id,task_id:'qa',expected_date:'',due_date:'2026-10-20',owner_id:owner}),/INVALID_TOOL_ARGUMENTS/);
 await assert.rejects(b.call({owner_id:owner},'update_my_task_due_date',{board_id:job.bot_id,task_id:'qa',expected_date:'',due_date:'2026-10-20'}),/STALE_JOB_LEASE/);
});
