'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
test('public research rejects loopback/private/reserved DNS, credentials and non-HTTPS targets',async()=>{
 let validatePublicTarget; try {({validatePublicTarget}=require('../scripts/private-bot-sources.cjs'));}catch{}
 assert.equal(typeof validatePublicTarget,'function','bounded public research missing');
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.100.100.100','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1']) {
  await assert.rejects(validatePublicTarget('https://public.example/',async()=>[{address,family:address.includes(':')?6:4}]));
 }
 for(const url of ['http://example.com','https://u:p@example.com','https://example.com:54321','file:///etc/passwd']) await assert.rejects(validatePublicTarget(url));
 const target=await validatePublicTarget('https://example.com/',async()=>[{address:'93.184.216.34',family:4}]);
 assert.equal(target.address,'93.184.216.34');
 await assert.rejects(validatePublicTarget('https://example.com/',async()=>[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]),'mixed DNS must fail closed');
});
test('Portal task tool returns only exact owner-assigned safe fields, never notes/comments/other tasks',()=>{
 let ownTasks;try {({ownTasks}=require('../scripts/private-bot-sources.cjs'));}catch{}
 assert.equal(typeof ownTasks,'function','owner scoped task reader missing');
 const boards=[{id:'board',board_data:{name:'Client',notes:'BEN PRIVATE',groups:[{tasks:[{id:'mine',assignedTo:'owner1',title:'My work',comments:[{text:'SECRET'}],status:'done',dueDate:'2026-01-01'},{id:'other',assignedTo:'owner2',title:'OTHER SECRET'}]}]}}];
 const tasks=ownTasks(boards,'owner1');assert.equal(tasks.length,1);assert.equal(tasks[0].id,'mine');assert.ok(!JSON.stringify(tasks).includes('SECRET'));assert.ok(!JSON.stringify(tasks).includes('BEN PRIVATE'));
});
