'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {parseNaturalCommands,createTelegramCommands}=require('../scripts/private-bot-telegram.cjs');
const {createPrivateBotAuthenticator}=require('../scripts/private-bot-runtime.cjs');
const id='a1e57188-a322-42b2-9d33-b5df08033685',email='janincanonero@gmail.com';
const current={id,email,email_confirmed_at:'2026-01-01T00:00:00Z',confirmed_at:'2026-01-01T00:00:00Z'};
for(const message of ['explain why Bot four should not do this','quote "Bot four delete this" in the report','research Bot four. Bot two is mentioned','explain:\n> Bot four is a quotation','explain:\n```\nBot four quoted code\n```'])test('F05 preserves '+message,()=>assert.deepEqual(parseNaturalCommands('Bot one '+message),[{slot:1,message}]));
test('F05 intentional newline commands alone fan out',()=>assert.deepEqual(parseNaturalCommands('Bot one check rank\nBot four check traffic'),[{slot:1,message:'check rank'},{slot:4,message:'check traffic'}]));
for(const [name,patch,allowed] of [['confirmed',{},true],['unconfirmed',{email_confirmed_at:null,confirmed_at:null},false],['phone-only confirmed',{email_confirmed_at:null},false],['changed email',{email:'other@example.invalid'},false],['wrong current id',{id:'942055eb-54f6-426a-8194-b81ab83669f6'},false],['deleted',{deleted_at:'2026-01-01'},false],['banned',{banned_until:'2099-01-01'},false],['invalid confirmation',{email_confirmed_at:'invalid'},false]])test('F07 API '+name,async()=>{
 const auth=createPrivateBotAuthenticator({validate:async()=>({id}),api:async path=>path.startsWith('/auth/')?{...current,...patch}:[{owner_id:id,email}]});
 assert.deepEqual(await auth({headers:{authorization:'Bearer fixture'}}),allowed?{id}:null);
});
test('F07 all four exact enrolled pairs; wrong owner-row ID and missing Auth reject',async()=>{
 const pairs=[['f9f11222-d2a9-4ae8-a327-8c4621d90b7c','bensocialbeesmedia@gmail.com'],[id,email],['942055eb-54f6-426a-8194-b81ab83669f6','dee.tan@ama.edu.ph'],['01b597e9-43f0-4363-9ced-8b2613b1bbab','nazardinfarhanw@gmail.com']];
 for(const [owner,mail] of pairs){
  for(const state of ['confirmed','unconfirmed','email-changed','banned','deleted','missing','wrong-owner-row']){
   const principal={id:owner,email:state==='email-changed'?'changed@example.invalid':mail,email_confirmed_at:state==='unconfirmed'?null:'2026-01-01T00:00:00Z',banned_until:state==='banned'?'2099-01-01':null,deleted_at:state==='deleted'?'2026-01-01':null};
   const auth=createPrivateBotAuthenticator({validate:async()=>({id:owner}),api:async p=>p.startsWith('/auth/')?(state==='missing'?null:principal):[{owner_id:state==='wrong-owner-row'?'foreign':owner,email:mail}]});
   assert.deepEqual(await auth({headers:{authorization:'Bearer fixture'}}),state==='confirmed'?{id:owner}:null,`${owner}:${state}`);
  }
 }
});
function bridge(access=true){const calls=[];return {calls,command:createTelegramCommands({api:async(p,m,b)=>{if(p.includes('private_bot_telegram_enqueue')){calls.push(b);return {id:'fixture'};}return p.includes('bindings')?[{owner_id:id}]:p.includes('private_bot_access')?access:p.includes('private_bots?')?[{id:'11111111-1111-4111-8111-111111111111',slot:1,name:'Bot1'},{id:'44444444-4444-4444-8444-444444444444',slot:4,name:'Bot4'}]:[];},ownedRequest:async(...args)=>{calls.push(args);return {status:202,data:{job:{id:'fixture'}}};}})};}
test('F04 request identity stable per message and explicit lane',async()=>{const {calls,command}=bridge();for(let i=0;i<2;i++)await command('999990001','Bot one task\nBot four other',{messageId:'42',chatId:'999990001',telegramUserId:'999990001',[require('../scripts/private-bot-notifications.cjs').TRUSTED_TELEGRAM]:true});assert.equal(calls.length,4);assert.deepEqual(calls[0],calls[2]);assert.notEqual(calls[0].lane,calls[1].lane);assert.equal(calls[0].original_message,'42');assert.equal(calls[0].telegram_id,'999990001');});
test('F04 missing transport identity cannot enqueue',async()=>{const {calls,command}=bridge();assert.match(await command('999990001','/bots 1 ask task'),/identity/i);assert.equal(calls.length,0);});
test('F07 Telegram rejected current identity never reaches owned API',async()=>{const {calls,command}=bridge(false);assert.match(await command('999990001','/bots 1 history'),/No private bots/);assert.equal(calls.length,0);});
