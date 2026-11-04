'use strict';
const {createHash,randomBytes}=require('node:crypto');
const {Readable}=require('node:stream');
const {createPrivateBotsHandler}=require('./portal-private-bots.cjs');
const {createNotifications}=require('./private-bot-notifications.cjs');
const TELEGRAM_ID=/^[1-9][0-9]{4,19}$/;
const hash=code=>createHash('sha256').update(code).digest('hex');
function parseNaturalCommands(text){
 const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
 // Only an unindented command at a new line can start another lane.
 // Inline mentions, Markdown quotes, fenced code and multiline quotations are data.
 const pattern=/^bot[ \t]*(10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten)\b[ \t]*/i;
 const commands=[];let fence=null,quote=null;
 for(const line of String(text).split(/\r?\n/)) {
  const match=!fence&&!quote?pattern.exec(line):null;
  if(match)commands.push({slot:words[match[1].toLowerCase()]||Number(match[1]),message:line.slice(match[0].length)});
  else if(!commands.length)return [];
  else commands[commands.length-1].message+='\n'+line;
  const mark=/^\s*(`{3,}|~{3,})/.exec(line);
  if(mark){if(!fence)fence=mark[1][0];else if(fence===mark[1][0])fence=null;continue;}
  if(!fence)for(let i=0;i<line.length;i++) {
   const ch=line[i];if(line[i-1]==='\\')continue;
   if(quote&&ch===quote)quote=null;
   else if(!quote&&(ch==='"'||ch==='“'||(ch==="'"&&!/[\w]/.test(line[i-1]||''))))quote=ch==='“'?'”':ch;
  }
 }
 return commands.map(x=>({...x,message:x.message.trim()})).filter(x=>x.message);
}
function createTelegramPortal({api}) {
 return async function portal(owner,action,method,payload={}) {
  const filter=`owner_id=eq.${encodeURIComponent(owner)}`;
  if(action==='' && method==='GET') {
   const binding=await api(`/rest/v1/private_bot_telegram_bindings?${filter}&select=telegram_user_id`);
   const pending=await api(`/rest/v1/private_bot_telegram_links?${filter}&approved_at=is.null&claimed_at=not.is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,telegram_user_id,expires_at&order=created_at.desc&limit=1`);
   return {status:200,data:{binding:binding[0]||null,pending:pending[0]||null}};
  }
  if(action==='link' && method==='POST' && !Object.keys(payload).length) {
   const code=randomBytes(32).toString('base64url');
   const result=await api('/rest/v1/rpc/issue_private_bot_telegram_link','POST',{subject:owner,digest:hash(code)});
   if(!result.id)return {status:429,data:{error:'Link creation rate limited. Try again in ten minutes.'}};
   return {status:200,data:{command:`/bots link ${code}`,expiresInSeconds:600}};
  }
  if(action==='approve' && method==='POST' && Object.keys(payload).sort().join(',')==='linkId,telegramUserId' && /^[0-9a-f-]{36}$/i.test(payload.linkId||'') && TELEGRAM_ID.test(payload.telegramUserId||'')) {
   const ok=await api('/rest/v1/rpc/approve_private_bot_telegram_link','POST',{subject:owner,link_id:payload.linkId,telegram_id:payload.telegramUserId});
   return {status:ok?200:404,data:ok?{approved:true}:{error:'Link approval is unavailable or expired.'}};
  }
  if(action==='' && method==='DELETE') {
   await api(`/rest/v1/private_bot_telegram_bindings?${filter}`,'DELETE');
   await api(`/rest/v1/private_bot_telegram_links?${filter}&approved_at=is.null`,'PATCH',{expires_at:new Date().toISOString()});
   return {status:200,data:{unlinked:true}};
  }
  return {status:400,data:{error:'Invalid Telegram account action.'}};
 };
}
function ownedRequestFactory(api) {
 return async (owner,path,method='GET',payload) => new Promise(resolve=>{
  const req=Readable.from(payload===undefined?[]:[Buffer.from(JSON.stringify(payload))]);req.url='/api/private-bots'+path;req.method=method;req.headers={};
  const res={status:200,writeHead(status){this.status=status;},end(text){resolve({status:this.status,data:JSON.parse(text)});}};
  createPrivateBotsHandler({api,authenticate:async()=>await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner})?{id:owner}:null})(req,res);
 });
}
function createTelegramCommands({api,ownedRequest=ownedRequestFactory(api),portalOrigin='https://echo-ben.tailfdbc33.ts.net'}) {
 const documents=require('./private-bot-document-delivery.cjs').createDocumentDelivery({api,ownedRequest});
 const notifications=createNotifications({api,documents});
 const origin=new URL(portalOrigin);
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('invalid Portal origin');
 const fileUrl=(botId,artifactId)=>`${origin.origin}/?privateBot=${encodeURIComponent(botId)}&privateArtifact=${encodeURIComponent(artifactId)}`;
 const rates=new Map();
 const dispatch=async (telegramId,command,identity={},lane=0) => {
  if(!TELEGRAM_ID.test(telegramId||''))return 'Use a private Telegram conversation with your own linked account.';
  const now=Date.now();let rate=rates.get(telegramId);if(!rate||rate.start<now-60000)rate={start:now,count:0};rate.count++;rates.set(telegramId,rate);
  if(rates.size>1000)for(const [id,r] of rates)if(r.start<now-60000)rates.delete(id);
  if(rate.count>20)return 'Private bot command rate limited. Wait one minute.';
  const natural=parseNaturalCommands(command);
  if(natural.length){
   if(natural.length>10)return 'Use at most ten explicit newline Bot commands.';
   return (await Promise.all(natural.map((x,i)=>dispatch(telegramId,`/bots ${x.slot} ask ${x.message}`,identity,i)))).join('\n\n');
  }
  const args=String(command).replace(/^\/bots(?:@[a-zA-Z0-9_]+)?\s*/i,'').trim();
  if(args.startsWith('link ')) {
   const code=args.slice(5).trim();if(!/^[A-Za-z0-9_-]{43}$/.test(code))return 'Invalid or expired link. Create a new code inside your signed-in Portal account.';
   const result=await api('/rest/v1/rpc/claim_private_bot_telegram_link','POST',{digest:hash(code),telegram_id:telegramId});
   return result.pending?`Link request received for Telegram ID ${telegramId}. Return to your own signed-in Portal account and explicitly approve this numeric ID. No bot access is granted until then.`:'Link unavailable, expired or rate limited. Create a new code inside your own Portal account.';
  }
  const bindings=await api(`/rest/v1/private_bot_telegram_bindings?telegram_user_id=eq.${telegramId}&select=owner_id`);
  const owner=bindings[0]?.owner_id;
  if(!owner || !await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))return 'No private bots are linked. Sign in to your own Portal account, open Private Bots → Telegram, and complete the two-sided link approval. This does not grant general Echo access.';
  const ordinary=/^echo\s+download\s+/.test(args);
  const bots=await api(`/rest/v1/private_bots?owner_id=eq.${owner}&slot=${ordinary?'eq.0':'gt.0'}&order=slot.asc`);
  if(!args || args==='list')return 'Your private work agents:\n'+bots.map(b=>`Bot${b.slot}: ${b.name}`).join('\n')+'\n\nBot one <task> or /bots 1 ask <task>\n/bots 1 history (completion replies also appear here)\n/bots 1 files\n/bots 1 download <file ID>\n/bots 1 name <name>\n/bots 1 instructions <preferences>\n/bots 1 context <reference text>\nSame saved workspaces, real authorised tools and private outputs as the Portal. Echo settings and other owners remain locked; sends/publication retain approval gates.';
  const match=/^(echo|10|[1-9])(?:\s+(ask|history|files|download|name|instructions|context)(?:\s+([\s\S]+))?)?$/.exec(args);
  if(!match)return 'Choose Bot1–Bot10 using /bots 1 ask <task>, /bots 1 history, or /bots 1 name <name>.';
  if(match[1]==='echo'&&!ordinary)return 'Ordinary Echo only supports /bots echo download <file ID> here. It is not a numbered private bot.';
  const bot=bots.find(b=>b.slot===(ordinary?0:Number(match[1])));if(!bot)return 'That bot is unavailable.';
  const action=match[2]||'history',value=match[3]||'';
  let result;
  if(action==='history') {
   result=await ownedRequest(owner,`/${bot.id}/jobs`);
   if(result.status!==200)return 'Private history unavailable.';
   return `${bot.name} · personal assistant\n`+(result.data.jobs.slice(0,5).reverse().map(j=>`You: ${j.message}\n${j.status}: ${j.response||j.error_code||'Task saved and waiting.'}`).join('\n\n')||'No tasks yet.').slice(-10000);
  }
  if(action==='files') {
   result=await ownedRequest(owner,`/${bot.id}/artifacts`);
   if(result.status!==200)return 'Private files unavailable.';
   return `${bot.name} · private files (latest 20)\n`+(result.data.artifacts.slice(0,20).map(a=>`${String(a.name).replace(/[\r\n]/g,' ').slice(0,120)} (${a.format})\nID: ${a.id}\n${fileUrl(bot.id,a.id)}`).join('\n\n')||'No files yet.')+'\nSign in as the same owner in the Portal to download. No access token is included in these links.';
  }
  if(action==='download') {
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()))return 'Use /bots N download <file ID> from /bots N files.';
   result=await ownedRequest(owner,ordinary?`/ordinary/artifacts/${value.trim()}`:`/${bot.id}/artifacts/${value.trim()}`);
   if(result.status!==200||!result.data.artifact)return 'Private file unavailable.';
   if(identity[require('./private-bot-notifications.cjs').TRUSTED_TELEGRAM]!==true)return 'Trusted Telegram message identity required.';
   const document=await documents.begin(owner,bot.id,result.data.artifact.id,identity);
   return document?{text:'Private document',document}:'Document delivery already attempted or unavailable. No automatic resend.';
  }
  if(!value.trim())return 'Include the task or customisation text after the command.';
  if(action==='ask') {
   if(identity.chatId!==telegramId||!/^[1-9][0-9]{0,19}$/.test(String(identity.messageId||'')))return 'Transport message identity is required. Send a new command through Telegram; no task was queued.';
   try {
    const job=await notifications.enqueue(owner,bot.id,value,identity,lane);
    return `${bot.name}: task queued privately. Job ${job.id}. A completion reply will appear here; /bots ${bot.slot} history and the Portal remain available.`;
   } catch(error) { return error.status===409 ? `Task not queued: ${bot.name} already has an active task. Use /bots ${bot.slot} history; /new resets chat, not running work.` : 'Task not queued: trusted delivery identity unavailable or conflicting. No new task was confirmed.'; }
  }
  result=await ownedRequest(owner,`/${bot.id}`,'PATCH',{[action]:value});
  return result.status===200?`${bot.name}: your private ${action} is saved in the same Portal workspace.`:`Settings not saved: ${result.data.error||'private service unavailable'}`;
 };dispatch.notifications=notifications;dispatch.documents=documents;return dispatch;
}
module.exports={createTelegramCommands,createTelegramPortal,ownedRequestFactory,parseNaturalCommands};
