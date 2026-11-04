'use strict';
// Protected socket only. IDs select existing owner-filtered artifacts, never paths/URLs.
const {createHash}=require('node:crypto');
const {MIME,safeCsv}=require('./private-bot-files.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function createDocumentDelivery({api,ownedRequest}){
 const rpc=(action,args)=>api('/rest/v1/rpc/private_bot_document_delivery','POST',{action,args});
 async function begin(owner,bot,artifact,identity){
  if(identity.chatId!==identity.telegramUserId||!/^\d+$/.test(identity.messageId||'')||![bot,artifact].every(x=>UUID.test(x)))throw Error('DOCUMENT_SCOPE_DENIED');
  const row=await rpc('begin',{owner,bot,artifact,chat:identity.chatId,message:identity.messageId,...(identity.notification_job?{notification_job:identity.notification_job,notification_lease:identity.notification_lease}:{})});
  if(!row.id||!row.lease)return null;
  return {id:row.id,lease:row.lease};
 }
 async function handle(action,args){
  const fields=action==='ack'?['id','lease','receipt']:['id','lease'];
  if(!['fetch','validate','ack','uncertain'].includes(action)||!args||Object.keys(args).sort().join()!==fields.sort().join()||!UUID.test(args.id||'')||!UUID.test(args.lease||''))throw Error('DOCUMENT_SCOPE_DENIED');
  if(action==='ack'&&!/^[1-9][0-9]{0,19}$/.test(args.receipt||''))throw Error('DOCUMENT_SCOPE_DENIED');
  if(action!=='fetch')return rpc(action,args);
  const row=await rpc('fetch',args);if(row.ok!==true)return {};
  const result=await ownedRequest(row.owner_id,row.slot===0?`/ordinary/artifacts/${row.artifact_id}`:`/${row.bot_id}/artifacts/${row.artifact_id}`);
  const a=result.data?.artifact;
  if(result.status!==200||!a||a.id!==row.artifact_id)throw Error('ORIGINAL_ARTIFACT_BYTES_UNAVAILABLE');
  if(typeof a.name!=='string'||!a.name||a.name.length>120||/[\\/\x00-\x1f\x7f]/.test(a.name)||!Object.hasOwn(MIME,a.format)||a.mime!==MIME[a.format])throw Error('ORIGINAL_ARTIFACT_METADATA_UNAVAILABLE');
  if(a.name!==row.filename||a.format!==row.artifact_format||a.mime!==row.mime)throw Error('ORIGINAL_ARTIFACT_METADATA_CHANGED');
  let bytes;
  if(a.binary_base64!==null&&a.binary_base64!==undefined){
   if(typeof a.binary_base64!=='string'||!a.binary_base64||a.binary_base64.length>2800000||a.binary_base64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.binary_base64))throw Error('ORIGINAL_ARTIFACT_BYTES_UNAVAILABLE');
   bytes=Buffer.from(a.binary_base64,'base64');
   if(bytes.toString('base64')!==a.binary_base64)throw Error('ORIGINAL_ARTIFACT_BYTES_UNAVAILABLE');
  }else{
   if(!['txt','md','json','csv'].includes(a.format)||typeof a.content!=='string'||a.content.includes('\0')||a.content.length>2097152)throw Error('ORIGINAL_ARTIFACT_BYTES_UNAVAILABLE');
   bytes=Buffer.from(a.content,'utf8');
   if(bytes.toString('utf8')!==a.content)throw Error('ORIGINAL_ARTIFACT_BYTES_UNAVAILABLE');
  }
  if(!bytes.length||bytes.length>2097152)throw Error('ORIGINAL_ARTIFACT_BYTES_UNAVAILABLE');
  if(['txt','md','json','csv'].includes(a.format)){
   const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
   if(text.includes('\0'))throw Error('ORIGINAL_ARTIFACT_BYTES_UNAVAILABLE');
   if(a.format==='json')JSON.parse(text);
   // Never sanitise and replace the bound hash. Portal CSV changes must fail.
   if(a.format==='csv'&&safeCsv(text)!==text)throw Error('ORIGINAL_ARTIFACT_BYTES_CHANGED');
  }
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(digest!==row.sha256)throw Error('ORIGINAL_ARTIFACT_BYTES_CHANGED');
  const valid=await rpc('fetch',args);
  if(valid.ok!==true||valid.sha256!==digest||valid.filename!==a.name||valid.artifact_format!==a.format||valid.mime!==a.mime)return {};
  return {ok:true,chat_id:row.chat_id,message_id:row.message_id,name:a.name,mime:MIME[a.format],base64:bytes.toString('base64'),size:bytes.length,sha256:digest};
 }
 return {begin,handle};
}
module.exports={createDocumentDelivery};
