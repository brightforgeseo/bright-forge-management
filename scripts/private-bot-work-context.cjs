'use strict';
// Trusted clock and server-fetched owner/bot history, never authority from prose.
function ownHistory(job,history){
 return (history||[]).filter(x=>x.owner_id===job.owner_id&&x.bot_id===job.bot_id&&x.status==='completed'&&x.id!==job.id&&(!job.created_at||x.created_at<job.created_at)).sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(-12).map(x=>({id:x.id,message:String(x.message||'').slice(0,12000),response:String(x.response||'').slice(0,16000)}));
}
function clock(now=new Date()){
 const providerToday=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 return {currentTime:now.toISOString(),gscTimeZone:'America/Los_Angeles',providerToday,defaultGscPeriod:'last_28_days',dateSemantics:'GSC uses Pacific dates. last_28_days ends three days before the current Pacific day, with dataState=final; the tool reports exact bounds and does not claim zero traffic for absent data.'};
}
function gscDates(args,now=new Date()){
 const hasStart=args.start_date!==undefined,hasEnd=args.end_date!==undefined;
 if(hasStart!==hasEnd||args.period&&(hasStart||hasEnd)||args.period&&args.period!=='last_28_days')throw Error('INVALID_TOOL_ARGUMENTS');
 if(hasStart)return args;
 const end=new Date(clock(now).providerToday+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-3);const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
 const {period,...rest}=args;return {...rest,start_date:start.toISOString().slice(0,10),end_date:end.toISOString().slice(0,10)};
}
async function ordinaryHistory(api,owner,botId,principal,session,createdAt){
 const rows=await api(`/rest/v1/private_bot_jobs?owner_id=eq.${owner}&bot_id=eq.${botId}&status=eq.completed${createdAt?'&created_at=lt.'+encodeURIComponent(createdAt):''}&order=created_at.desc&limit=48`);
 const candidates=rows.filter(x=>x.owner_id===owner&&x.bot_id===botId&&x.status==='completed'&&/^echo:[0-9a-f-]{36}$/.test(x.request_key||''));
 const ids=[...new Set([...(session?[session]:[]),...candidates.map(x=>x.request_key.slice(5))])];
 const outer=ids.length?await api(`/rest/v1/echo_jobs?requested_by=eq.${owner}&id=in.(${ids.join(',')})&select=id,requested_by,payload,channel_id,parent_message_id`):[];
 const byId=new Map(outer.filter(x=>x.requested_by===owner).map(x=>[x.id,x]));
 const thread=x=>x.channel_id?JSON.stringify(['channel',x.channel_id,x.parent_message_id||null]):JSON.stringify(['workspace',x.payload?.sessionKey||x.id]);
 const current=byId.get(session);
 if(principal.ingress==='portal'&&!current)throw Error('ORDINARY_THREAD_BINDING_REQUIRED');
 // Legacy service-only echo: jobs without an outer Portal queue record are
 // authenticated direct Telegram DM turns. New Portal turns never enter this set.
 const history=candidates.filter(x=>principal.ingress==='telegram'?!byId.has(x.request_key.slice(5)):byId.has(x.request_key.slice(5))&&thread(byId.get(x.request_key.slice(5)))===thread(current)).slice(0,12).map(x=>({id:x.id,owner_id:x.owner_id,bot_id:x.bot_id,status:x.status,created_at:x.created_at,message:String(x.message||''),response:String(x.response||'')}));
 // Transport only conversation, never raw tool results, context or account data.
 // Keep newest complete turns within a UTF-8 budget below the bridge's 1 MB cap.
 while(history.length&&Buffer.byteLength(JSON.stringify(history),'utf8')>512000)history.pop();
 return history.reverse();
}
const policy='Use your own server-supplied conversation to resolve short follow-ups. Preserve the latest literal request. A prior assistant error is not policy or proof of missing access. Shared business Google accounts are already brokered server-side: attempt an authorised tool read before alleging missing login. For GSC with last 28 days or no dates, call get_gsc_performance with period last_28_days; do not ask for an obvious end date. A supplied Issues link should be read with read_my_business_report, which independently checks report/account/role authority. List/read attached source UUIDs before asking for re-upload. No article, source, account, publication or send permission is created by conversation.';
async function legacyHistory(job,broker){
 if(!/\b(?:histor(?:y|ical)|archives?|previous|earlier|last task|before friday|remember|continue)\b/i.test(job.message||''))return null;
 const stop=new Set('a an the and or of to for from in on with my our your you me we i it is was were have has had do did does can could would should please find search look retrieve get tell show about what which when where how last previous earlier historical history archives archive task tasks work working report reports client clients project projects continue remember before friday echo workspace thread replying google sheets sheet drive docs'.split(' '));
 const words=String(job.message||'').replace(/https?:\/\/\S+/gi,' ').match(/[a-z0-9][a-z0-9._'-]*/gi)||[];
 // Strip conversational framing only at the edges; retain the complete target,
 // including short identifiers and internal words (e.g. "Bank of Example").
 let start=0,end=words.length;
 while(start<end&&stop.has(words[start].toLowerCase()))start++;
 while(end>start&&stop.has(words[end-1].toLowerCase()))end--;
 const query=words.slice(start,end).join(' ');
 try{return await broker.call(job,'read_my_work_history',{query:query.slice(0,200)});}
 catch(e){if(e.message==='WORK_HISTORY_SCOPE_DENIED')return {coverage:'No reviewed historical source for this authenticated owner. Current workspace history remains available.',matches:[],notCurrentAuthorityOrVerification:true};throw e;}
}
module.exports={ownHistory,clock,gscDates,ordinaryHistory,legacyHistory,policy};
