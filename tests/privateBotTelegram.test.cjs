const test=require('node:test');const assert=require('node:assert/strict');
test('natural Bot one and Bot four requests split into exact owned lanes',()=>{
 const {parseNaturalCommands}=require('../scripts/private-bot-telegram.cjs');
 assert.equal(typeof parseNaturalCommands,'function','natural bot routing missing');
 assert.deepEqual(parseNaturalCommands('Bot one check our rank.\nBot four get traffic for 10 October 2026.'),[{slot:1,message:'check our rank.'},{slot:4,message:'get traffic for 10 October 2026.'}]);
 assert.deepEqual(parseNaturalCommands('Change Echo model'),[]);
});
test('Telegram commands are owner-bound, unknown identities never reach bot API and forged slot is rejected',async()=>{
 let createTelegramCommands;try{({createTelegramCommands}=require('../scripts/private-bot-telegram.cjs'));}catch{}
 assert.equal(typeof createTelegramCommands,'function','same-store Telegram bridge missing');
 const {TRUSTED_TELEGRAM}=require('../scripts/private-bot-notifications.cjs');
 const calls=[];
 const command=createTelegramCommands({api:async(path)=>{calls.push(path);if(path.includes('private_bot_telegram_bindings'))return [{owner_id:'owner1'}];if(path.includes('private_bot_access'))return true;if(path.includes('private_bots?'))return [{id:'bot1',slot:1,name:'Bot1'}];if(path.includes('private_bot_telegram_enqueue'))return {id:'job1'};return [];},ownedRequest:async(owner,path,method,payload)=>({status:202,data:{job:{id:'job1'}}})});
 assert.match(await command('123456789','/bots 99 ask forged'),/Bot1/);
 calls.length=0;assert.match(await command('notanid','/bots'),/private/);assert.equal(calls.length,0);
 assert.match(await command('123456789','/bots 1 ask do my task',{chatId:'123456789',telegramUserId:'123456789',messageId:'12',[TRUSTED_TELEGRAM]:true}),/job1/);
});
