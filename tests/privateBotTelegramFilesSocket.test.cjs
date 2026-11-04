'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createTelegramCommands,ownedRequestFactory}=require('../scripts/private-bot-telegram.cjs');
const {startTelegramSocket}=require('../scripts/private-bot-telegram-socket.cjs');
const bot='11111111-1111-4111-8111-111111111111',file='22222222-2222-4222-8222-222222222222';
test('files/download are owner checked, tokenless and foreign files denied by actual owned handler',async()=>{
 let deliveries=0;const api=async(p,m,b)=>{
  if(p.endsWith('/private_bot_document_delivery')){assert.equal(b.action,'begin');assert.equal(b.args.owner,'owner-a');assert.equal(b.args.bot,bot);assert.equal(b.args.artifact,file);deliveries++;return {id:file,lease:bot};}
  if(p.includes('bindings'))return [{owner_id:'owner-a'}];
  if(p.includes('private_bot_access'))return true;
  if(p.startsWith('/rest/v1/private_bots?')){assert.match(p,/owner_id=eq.owner-a/);return [{id:bot,slot:1,name:'Bot1'}];}
  if(p.includes('private_bot_artifacts?')){assert.match(p,/owner_id=eq.owner-a/);assert.match(p,new RegExp('bot_id=eq.'+bot));if(p.includes('&id=eq.')&&!p.includes('&id=eq.'+file))return [];return [{id:file,name:'fixture.csv',format:'csv',content:'a,b'}];}
  throw Error('unexpected request '+p);
 };
 const command=createTelegramCommands({api,ownedRequest:ownedRequestFactory(api)});
 const listing=await command('999990001','/bots 1 files');assert.match(listing,/https:\/\/echo-ben.tailfdbc33.ts.net\//);assert.match(listing,/privateArtifact=/);assert.doesNotMatch(listing,/token=|Bearer|a,b/);
 assert.equal(await command('999990001','/bots 1 download '+file),'Trusted Telegram message identity required.');assert.equal(deliveries,0);
 const identity={chatId:'999990001',telegramUserId:'999990001',messageId:'42',[require('../scripts/private-bot-notifications.cjs').TRUSTED_TELEGRAM]:true};const download=await command('999990001','/bots 1 download '+file,identity);assert.deepEqual(download,{text:'Private document',document:{id:file,lease:bot}});assert.equal(deliveries,1);
 assert.equal(await command('999990001','/bots 1 download 33333333-3333-4333-8333-333333333333',identity),'Private file unavailable.');assert.equal(deliveries,1);
});
test('isolated Unix socket requires exact transport identity and forwards it',async()=>{
 const root=process.env.TMPDIR||'/home/benecho/.hermes/cache/scratch';const home=fs.mkdtempSync(path.join(root,'tg-fixture-'));const calls=[];
 const server=await startTelegramSocket({home,command:async(...args)=>{calls.push(args);return 'fixture only';}});
 try{
  const send=data=>new Promise((resolve,reject)=>{const req=http.request({socketPath:path.join(home,'.cache/bright-forge-private-bots/telegram.sock'),path:'/command',method:'POST'},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);req.end(JSON.stringify(data));});
  const input={telegramUserId:'999990001',chatId:'999990001',messageId:'42',command:'/bots'};
  assert.equal((await send(input)).status,200);assert.deepEqual(calls[0],['999990001','/bots',{chatId:'999990001',messageId:'42',telegramUserId:'999990001',[require('../scripts/private-bot-notifications.cjs').TRUSTED_TELEGRAM]:true}]);
  for(const patch of [{chatId:'999990002'},{messageId:''},{messageId:42},{messageId:'-1'},{ownerId:'forged'}])assert.equal((await send({...input,...patch})).status,400);
  assert.equal(calls.length,1);assert.equal(fs.statSync(path.join(home,'.cache/bright-forge-private-bots/telegram.sock')).mode&0o777,0o600);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(home,{recursive:true,force:true});}
});
