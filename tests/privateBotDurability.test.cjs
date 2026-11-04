const test=require('node:test'),assert=require('node:assert/strict');const {PassThrough}=require('node:stream');const {EventEmitter}=require('node:events');const {runAgentModel}=require('../scripts/private-bot-agent-runtime.cjs');const {durableCall,operationId}=require('../scripts/private-bot-operations.cjs');
test('timeout aborts callback chain and never persists a late tool trace',async()=>{
 const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{setImmediate(()=>c.emit('close',1));};let traces=0,resolveTool,seenSignal;
 const p=runAgentModel({job:{},messages:[],broker:{schemas:()=>[],call:job=>{seenSignal=job.signal;return new Promise(r=>resolveTool=r);}},onTool:async()=>traces++,spawnModel:()=>c,timeoutMs:25});
 c.stdout.write(JSON.stringify({event:'tool_call',callId:'1',name:'save_output',arguments:{}})+'\n');
 await assert.rejects(p,/OUTCOME_UNCERTAIN/);assert.equal(seenSignal.aborted,true);resolveTool({saved:true});await new Promise(r=>setTimeout(r,20));assert.equal(traces,0);
});
test('committed receipt reused after response loss without second effect',async()=>{
 const receipts=new Map();let effects=0;const job={id:'j',owner_id:'o',worker_id:'w'};
 const api=async(p,m,b)=>{if(receipts.has(b.op))return {receipt:receipts.get(b.op)};if(b.phase==='begin'){effects++;const receipt={saved:true,id:'one'};receipts.set(b.op,receipt);throw Error('lost response after commit');}};
 await assert.rejects(durableCall(api,job,'save_output',{content:'same'},()=>{throw Error('not used');}),/lost response/);
 assert.deepEqual(await durableCall(api,job,'save_output',{content:'same'},()=>{throw Error('not used');}),{saved:true,id:'one'});assert.equal(effects,1);
 assert.equal(operationId('save_output',{content:'same',binary_base64:'A'}),operationId('save_output',{binary_base64:'B',content:'same'}));
 assert.notEqual(operationId('read',{a:{b:1}}),operationId('read',{a:{b:2}}));
});
test('failed output boundary never exposes direct generated response',async()=>{
 const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{};
 const p=runAgentModel({job:{},messages:[],broker:{schemas:()=>[],checkOutput:async()=>{throw Error('ARTICLE_ENGINE_BINDING_REQUIRED');}},spawnModel:()=>c,timeoutMs:1000});
 c.stdout.write(JSON.stringify({event:'completed',response:'unbound sentinel'})+'\n');c.emit('close',0);await assert.rejects(p);
});
