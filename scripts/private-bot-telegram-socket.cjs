'use strict';
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const net=require('node:net');
const {TRUSTED_TELEGRAM}=require('./private-bot-notifications.cjs');
async function startTelegramSocket({command,work,home=process.env.HOME}) {
 const directory=path.join(home,'.cache/bright-forge-private-bots');fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.chmodSync(directory,0o700);
 const socketPath=path.join(directory,'telegram.sock');
 if(fs.existsSync(socketPath)) {
  const stat=fs.lstatSync(socketPath);if(!stat.isSocket()||stat.uid!==process.getuid())throw Error('private socket path is not owned');
  const active=await new Promise(resolve=>{const c=net.connect(socketPath);c.once('connect',()=>{c.destroy();resolve(true);});c.once('error',()=>resolve(false));});
  if(active)throw Error('private socket is already active');fs.unlinkSync(socketPath);
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  try{
   if(req.method==='GET'&&req.url==='/runtime')return res.end(JSON.stringify(require('./private-bot-build.cjs').runtimeState()));
   const notification=/^\/notifications\/(claim|validate|dispatch|ack|uncertain)$/.exec(req.url);
   const document=/^\/documents\/(fetch|validate|ack|uncertain)$/.exec(req.url);
   if(req.method!=='POST'||(req.url!=='/command'&&!notification&&!document&&!(req.url==='/work'&&work))){res.writeHead(404);return res.end('{}');}
   let data='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>(req.url==='/work'?160000:16000))throw Error('too large');data+=chunk;}
   const input=JSON.parse(data);
   if(req.url==='/work'){
    res.once('close',()=>{if(!res.writableEnded&&['begin','call','finish'].includes(input.action))work({action:'cancel',principal:input.principal,session:input.session,attempt:input.attempt}).catch(()=>{});});
    return res.end(JSON.stringify(await work(input,TRUSTED_TELEGRAM)));
   }
   if(document)return res.end(JSON.stringify(await command.documents.handle(document[1],input)));
   if(notification){const result=await command.notifications.handle(notification[1],input);return res.end(JSON.stringify(result));}
   if(Object.keys(input).sort().join(',')!=='chatId,command,messageId,telegramUserId'||typeof input.telegramUserId!=='string'||!/^[1-9][0-9]{4,19}$/.test(input.telegramUserId)||input.chatId!==input.telegramUserId||typeof input.messageId!=='string'||!/^[1-9][0-9]{0,19}$/.test(input.messageId)||typeof input.command!=='string'||input.command.length>12500||!/^(?:\/bots(?:@[a-zA-Z0-9_]+)?(?:\s|$)|bot\s*(?:10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten)\b)/i.test(input.command))throw Error('invalid input');
   const text=await command(input.telegramUserId,input.command,{chatId:input.chatId,messageId:input.messageId,telegramUserId:input.telegramUserId,[TRUSTED_TELEGRAM]:true});res.end(JSON.stringify(typeof text==='string'?{text}:text));
  }catch(error){res.writeHead(400);res.end(JSON.stringify(req.url==='/work'?{error:require('./ordinary-echo-errors.cjs').safeFault(error)}:{text:'Private bot command unavailable. No task has been confirmed.'}));}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,()=>{fs.chmodSync(socketPath,0o600);resolve();});});
 return server;
}
module.exports={startTelegramSocket};
