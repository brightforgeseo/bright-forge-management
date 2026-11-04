'use strict';
// This symbol is never serialised or accepted from the public Portal.
const TRUSTED_TELEGRAM=Symbol('protected Telegram socket');
function createNotifications({api,documents}) {
 return {
  async enqueue(owner,bot,message,identity,lane) {
   if(identity[TRUSTED_TELEGRAM]!==true)throw Error('trusted transport required');
   if(identity.chatId!==identity.telegramUserId||!/^\d+$/.test(identity.messageId)||!Number.isInteger(lane)||lane<0||lane>9||!message.trim()||message.length>12000)throw Error('invalid request');
   return api('/rest/v1/rpc/private_bot_telegram_enqueue','POST',{subject:owner,bot,telegram_id:identity.telegramUserId,original_message:identity.messageId,lane,body:message.trim()});
  },
  async handle(action,args) {
   const fields={claim:[],validate:['job_id','lease'],dispatch:['job_id','lease'],ack:['job_id','lease','receipt'],uncertain:['job_id','lease']}[action];
   if(!fields||!args||Object.keys(args).sort().join(',')!==fields.sort().join(',')||Object.values(args).some(x=>typeof x!=='string'||!x||x.length>100))throw Error('invalid notification request');
   const row=await api('/rest/v1/rpc/private_bot_notification','POST',{action,args});
   if(row?.job_id&&action==='claim') {
    const link=`https://echo-ben.tailfdbc33.ts.net/?privateBot=${encodeURIComponent(row.bot_id)}`;
    // Leave headroom for Telegram Markdown escaping (up to 2x UTF-16 units).
    row.text=`${row.status==='completed'?'Task completed':'Task failed'}\n${String(row.response||row.error_code||'Open the Portal for details.').slice(0,1400)}\n\nOwner sign-in required: ${link}`;
    if(row.attachment_only===true)delete row.text;
    delete row.response;delete row.error_code;
    row.documents=[];
    try{if(documents&&row.status==='completed'){
     const files=await api(`/rest/v1/private_bot_artifacts?owner_id=eq.${row.owner_id}&bot_id=eq.${row.bot_id}&job_id=eq.${row.job_id}&source_file=eq.false&select=id&order=created_at.asc&limit=9`);
     if(files.length>8)throw Error('DOCUMENT_BATCH_LIMIT');
     for(const file of files){const d=await documents.begin(row.owner_id,row.bot_id,file.id,{chatId:row.chat_id,telegramUserId:row.chat_id,messageId:row.message_id,notification_job:row.job_id,notification_lease:row.lease});if(!d)throw Error('DOCUMENT_DELIVERY_UNCERTAIN');row.documents.push(d);}
    }
    if(row.attachment_only===true&&!row.documents.length)throw Error('DOCUMENT_DELIVERY_UNCERTAIN');
    }catch(error){await api('/rest/v1/rpc/private_bot_notification','POST',{action:'uncertain',args:{job_id:row.job_id,lease:row.lease}});throw error;}
   }
   return row;
  }
 };
}
module.exports={TRUSTED_TELEGRAM,createNotifications};
