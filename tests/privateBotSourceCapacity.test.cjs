const test=require('node:test'),assert=require('node:assert/strict');
const https=require('node:https'),dns=require('node:dns/promises');const {EventEmitter}=require('node:events');
const source=require('../scripts/private-bot-sources.cjs');
test('dual-stack source prefers validated IPv4 and never tolerates a private address',async()=>{
 const url='https://example.com/';
 const mixed=async()=>[{address:'2606:4700:3032::ac43:a05f',family:6},{address:'93.184.216.34',family:4}];
 const selected=await source.validatePublicTarget(url,mixed);assert.equal(selected.family,4);assert.equal(selected.address,'93.184.216.34');
 await assert.rejects(source.validatePublicTarget(url,async()=>[{address:'::1',family:6},{address:'93.184.216.34',family:4}]),/PUBLIC_URL_REQUIRED/);
 const only6=await source.validatePublicTarget(url,async()=>[{address:'2606:4700:3032::ac43:a05f',family:6}]);assert.equal(only6.family,6);
});
const {createAgentToolBroker}=require('../scripts/private-bot-agent-tools.cjs');
test('broker task pagination exhausts server-capped pages and honestly reports board scan cap',async()=>{
 const owner='a1e57188-a322-42b2-9d33-b5df08033685';
 let count=3;const offsets=[];
 const broker=createAgentToolBroker({api:async(p,m,b)=>{
  if(p.endsWith('/private_bot_operation'))return b.phase==='begin'?{started:true}:{receipt:b.result};
  if(p.endsWith('/private_bot_access'))return true;
  if(p.startsWith('/rest/v1/client_boards?')){const u=new URL(p,'https://example.com');assert.equal(u.searchParams.get('order'),'id.asc');const offset=Number(u.searchParams.get('offset'));offsets.push(offset);return offset>=count?[]:[{id:String(offset),board_data:{name:'Client',groups:[{tasks:[{id:String(offset),title:offset===2?'Consilium':'Other',assignedTo:owner}]}]}}];}
  throw Error(p);
 }});
 const result=await broker.call({owner_id:owner,id:'qa',worker_id:'qa'},'get_my_portal_tasks',{query:'Consilium'});
 assert.equal(result.tasks[0].id,'2');assert.equal(result.total,1);assert.equal(result.boardScanComplete,true);assert.equal(result.hasMore,false);assert.deepEqual(offsets,[0,1,2,3]);
 count=1001;const bounded=await broker.call({owner_id:owner,id:'qa2',worker_id:'qa'},'get_my_portal_tasks',{query:'Absent'});
 assert.equal(bounded.total,null);assert.equal(bounded.observedTotal,0);assert.equal(bounded.boardScanComplete,false);assert.equal(bounded.hasMore,true);
});
test('bounded page reader accepts actual 1.3MB class pages and rejects over 2MiB',async t=>{
 t.mock.method(dns,'lookup',async()=>[{address:'93.184.216.34',family:4}]);
 let size=1318318;
 t.mock.method(https,'get',(url,options,cb)=>{const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/html'};res.destroy=()=>{};res.resume=()=>{};cb(res);res.emit('data',Buffer.from('<h1>Verified Clinic</h1>'+' '.repeat(size)));res.emit('end');});return req;});
 const result=await source.inspectPublicPage('https://example.com/');assert.deepEqual(result.h1,['Verified Clinic']);
 size=2*1024*1024+1;await assert.rejects(source.inspectPublicPage('https://example.com/'),/PUBLIC_SOURCE_TOO_LARGE/);
});
test('owner task search filters before cap and discloses truncation without exposing foreign tasks',()=>{
 const tasks=Array.from({length:501},(_,i)=>({id:String(i),title:i===500?'Consilium lookup':'Ordinary task',assignedTo:'own'}));tasks.push({id:'secret',title:'Consilium SECRET',assignedTo:'foreign'});
 const boards=[{id:'b',board_data:{name:'Client',groups:[{tasks}]}}];
 const page=source.ownTaskPage(boards,'own');assert.equal(page.tasks.length,500);assert.equal(page.total,501);assert.equal(page.hasMore,true);
 const filtered=source.ownTaskPage(boards,'own',{query:'Consilium'});assert.equal(filtered.total,1);assert.equal(filtered.hasMore,false);assert.equal(filtered.tasks[0].id,'500');assert.ok(!JSON.stringify(filtered).includes('SECRET'));
});
