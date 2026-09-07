const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./userManagementApi.test.cjs');
test('reset and delete require owner auth, valid targets and bounded passwords',async t=>{
 const {request,calls}=await fixture(t);
 const target='/33333333-3333-4333-8333-333333333333';
 assert.equal((await request('member',target,{method:'DELETE'})).status,403);
 assert.equal((await request('owner','/AAAAAAAA-1111-4111-8111-111111111111',{method:'DELETE'})).status,409);
 assert.equal((await request('owner',target,{method:'PATCH',body:JSON.stringify({password:'tiny'})})).status,400);
 assert.equal((await request('owner',target,{method:'PATCH',body:JSON.stringify({password:'synthetic-long-password'})})).status,200);
 assert.ok(calls.some(c=>c.method==='PUT' && c.url.endsWith(target)));
 assert.equal((await request('owner',target,{method:'DELETE'})).status,200);
 assert.ok(calls.some(c=>c.method==='DELETE' && c.url.endsWith(target)));
});
