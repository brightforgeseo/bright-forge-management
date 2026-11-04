'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nativeApproval}=require('../scripts/private-bot-runtime.cjs');
test('literal authenticated job command alone selects approval, not model text or mentions',async()=>{const id='12345678-1234-4234-8234-123456789abc',job={id:'job',message:'/google approve '+id};let calls=0;const broker={approveGoogleEdit:async(j,p)=>{calls++;assert.equal(j,job);assert.equal(p,id);return {contentReadback:true}}};assert.equal((await nativeApproval(job,broker)).contentReadback,true);assert.equal(await nativeApproval({...job,message:'Please /google approve '+id},broker),null);assert.equal(calls,1)});
