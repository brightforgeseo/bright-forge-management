'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createNotifications,TRUSTED_TELEGRAM}=require('../scripts/private-bot-notifications.cjs');
test('only protected dispatch can subscribe; request keys are not authority',async()=>{
 const n=createNotifications({api:async()=>{throw Error('must not call')}});
 await assert.rejects(n.enqueue('owner','bot','text',{chatId:'12345',messageId:'1'},0),/trusted/);
});
test('trusted dispatch uses atomic RPC and preserves owner and original message',async()=>{
 const calls=[];const n=createNotifications({api:async(...x)=>{calls.push(x);return {id:'job'};}});
 const identity={chatId:'12345',telegramUserId:'12345',messageId:'9',[TRUSTED_TELEGRAM]:true};
 assert.equal((await n.enqueue('owner','bot','task',identity,0)).id,'job');
 assert.equal(calls[0][0],'/rest/v1/rpc/private_bot_telegram_enqueue');
 assert.deepEqual(calls[0][2],{subject:'owner',bot:'bot',telegram_id:'12345',original_message:'9',lane:0,body:'task'});
 await assert.rejects(n.enqueue('owner','bot','task',{...identity,chatId:'67890'},0),/invalid/);
});
test('claim uses persisted RPC; validate and ack retain exact lease identity',async()=>{
 const calls=[];const n=createNotifications({api:async(p,m,b)=>{calls.push([p,b]);return {job_id:'j',bot_id:'b',owner_id:'o',lease:'l',chat_id:'12345',message_id:'1',response:'x'.repeat(9000),status:'completed'};}});
 const c=await n.handle('claim',{});assert.ok(c.text.length<4000);assert.match(c.text,/privateBot=b/);
 await n.handle('validate',{job_id:'j',lease:'l'});await n.handle('ack',{job_id:'j',lease:'l',receipt:'99'});
 assert.equal(calls[1][1].args.lease,'l');assert.equal(calls[2][1].args.receipt,'99');
 await assert.rejects(n.handle('claim',{chat_id:'hijack'}),/invalid/);
});
