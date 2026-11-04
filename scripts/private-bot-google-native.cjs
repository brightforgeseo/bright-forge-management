'use strict';
// Original edits are proposals first. Only a fresh literal human approval job can
// commit. No model-callable apply tool, credential fallback, ACL write or replay.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {diskStore}=require('./private-bot-google-workspace.cjs');
const {generalPlan}=require('./private-bot-google-general.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clean=x=>{const y=structuredClone(x);delete y.revisionId;return y;};
function createNativeOperations({api,workspace,store=diskStore(),http=fetch,checkOutput=require('./private-bot-article-boundary.cjs').guardOutput}){
 const subject=(owner,id)=>workspace.accountSubject?workspace.accountSubject(owner,id):Promise.resolve(store.read().accounts?.[owner]?.sub);
 const sourceJson=(owner,id,url,options={})=>workspace.googleJson?workspace.googleJson(owner,id,url,options):workspace.token(owner).then(access=>json(url,access,options));
 const save=(id,value)=>{const s=store.read();s.nativeProposals||={};s.nativeProposals[id]=value;store.write(s);};
 async function fence(job){if(job.signal?.aborted||!job.id||!job.bot_id||!job.worker_id||!await api('/rest/v1/rpc/private_bot_access','POST',{subject:job.owner_id}))throw Error('CAPABILITY_DENIED');const rows=await api(`/rest/v1/private_bot_jobs?id=eq.${encodeURIComponent(job.id)}&owner_id=eq.${encodeURIComponent(job.owner_id)}&bot_id=eq.${encodeURIComponent(job.bot_id)}&worker_id=eq.${encodeURIComponent(job.worker_id)}&status=eq.running&lease_expires_at=gt.${encodeURIComponent(new Date(Date.now()+30000).toISOString())}&select=id`);if(rows.length!==1||job.signal?.aborted)throw Error('STALE_JOB_LEASE');}
 async function json(url,access,options={}){const r=await http(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+access,'content-type':'application/json'}});if(!r.ok)throw Error('GOOGLE_NATIVE_SERVICE_UNAVAILABLE');const value=await r.json();if(Buffer.byteLength(JSON.stringify(value))>250000)throw Error('GOOGLE_CONTENT_LIMIT');return value;}
 async function snapshot(job,args){
  await fence(job);const grant=await workspace.grant(job.owner_id,args.fileId,'native'),meta=await workspace.drive(job.owner_id,args.fileId);
  if(grant.resourcePolicy&&(!grant.boardId||grant.resourcePolicy.nativeRoot))require('./private-bot-native-authority.cjs').ordinary([],grant,job);
  const purpose=workspace.nativePurpose?await workspace.nativePurpose(job,args):null;
  const privateJson=(url)=>sourceJson(job.owner_id,args.fileId,url,purpose?{nativePurpose:purpose}:{});
  if(meta.id!==args.fileId||meta.trashed||meta.capabilities?.canEdit!==true)throw Error('GOOGLE_NATIVE_EDIT_DENIED');
  const permissions=[];let page;do{const p=await privateJson(`https://www.googleapis.com/drive/v3/files/${args.fileId}/permissions?supportsAllDrives=true&fields=nextPageToken,permissions(id,type,role,emailAddress,domain,allowFileDiscovery,expirationTime,deleted,pendingOwner,permissionDetails)&pageSize=100${page?'&pageToken='+encodeURIComponent(page):''}`);if(!Array.isArray(p.permissions))throw Error('GOOGLE_ACL_BASELINE_REQUIRED');permissions.push(...p.permissions);page=p.nextPageToken;if(permissions.length>1000)throw Error('GOOGLE_ACL_LIMIT');}while(page);
  permissions.sort((a,b)=>a.id.localeCompare(b.id));
  const sheet=['sheet_replace','sheet_batch','sheet_values','sheet_cells'].includes(args.operation);
  if(!['doc_replace','sheet_replace','doc_rewrite','sheet_batch','sheet_values','sheet_cells','doc_runs'].includes(args.operation)||meta.mimeType!==`application/vnd.google-apps.${sheet?'spreadsheet':'document'}`)throw Error('GOOGLE_NATIVE_OPERATION_UNSUPPORTED');
  const content=await privateJson(sheet?`https://sheets.googleapis.com/v4/spreadsheets/${args.fileId}?includeGridData=true`:`https://docs.googleapis.com/v1/documents/${args.fileId}?includeTabsContent=true`);
  if(sheet?content.spreadsheetId!==args.fileId:(content.documentId!==args.fileId||typeof content.revisionId!=='string'||!content.revisionId))throw Error('GOOGLE_NATIVE_REVISION_REQUIRED');
  return {grant,account:await subject(job.owner_id,args.fileId),meta:{id:meta.id,mimeType:meta.mimeType,parents:meta.parents||[],driveId:meta.driveId||null},permissions,content};
 }
 function expectedDoc(snapshot,args){
  let footprint;try{footprint=JSON.parse(args.footprint);}catch{throw Error('INVALID_GOOGLE_FOOTPRINT');}
  if(!footprint||Array.isArray(footprint)||Object.keys(footprint).join(',')!=='tabId'||typeof footprint.tabId!=='string'||!footprint.tabId||footprint.tabId.length>100)throw Error('INVALID_GOOGLE_FOOTPRINT');
  // Exact unique single-run rewrite. Variable length rebases only body indices;
  // every text style/link/paragraph and non-target object must still match.
  if(typeof args.expected!=='string'||!args.expected||typeof args.replacement!=='string'||!args.replacement||args.expected===args.replacement||args.expected.length>60000||args.replacement.length>60000||/[\r\n\x00-\x1f]/.test(args.expected+args.replacement))throw Error('GOOGLE_EXACT_TEXT_FOOTPRINT_REQUIRED');
  const expected=structuredClone(snapshot.content),hits=[],texts=[];const tabs=[];
  const visitTabs=items=>{for(const t of items||[]){tabs.push(t);visitTabs(t.childTabs);}};visitTabs(expected.tabs);
  const tab=tabs.find(t=>t.tabProperties?.tabId===footprint.tabId);if(!tab)throw Error('INVALID_GOOGLE_FOOTPRINT');
  const walk=x=>{if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(/^suggested/.test(k)&&v&&JSON.stringify(v)!=='{}')throw Error('GOOGLE_SUGGESTIONS_UNSUPPORTED');if(k==='textRun'&&typeof v.content==='string'){texts.push(v.content);let i=-1;while((i=v.content.indexOf(args.expected,i+1))!==-1)hits.push(v);}else walk(v);}};walk(tab.documentTab);
  if(hits.length!==1||texts.join('').split(args.expected).length!==2)throw Error('GOOGLE_UNIQUE_TEXT_REQUIRED');
  const delta=args.replacement.length-args.expected.length;
  if(delta){
   if(Object.keys(tab.documentTab.namedRanges||{}).length)throw Error('GOOGLE_VARIABLE_NAMED_RANGE_UNSUPPORTED');
   const elements=(tab.documentTab.body?.content||[]).flatMap(x=>x.paragraph?.elements||[]),element=elements.find(e=>e.textRun===hits[0]);
   if(!element||!Number.isSafeInteger(element.startIndex))throw Error('GOOGLE_VARIABLE_BODY_RUN_REQUIRED');
   const cut=element.startIndex+hits[0].content.indexOf(args.expected)+args.expected.length;
   const shift=x=>{if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(['startIndex','endIndex'].includes(k)&&Number.isSafeInteger(v)&&v>=cut)x[k]=v+delta;else shift(v);}};shift(tab.documentTab.body);
  }
  hits[0].content=hits[0].content.replace(args.expected,args.replacement);
  return {expected,footprint};
 }
 function expectedChange(snapshot,args){
  const plan=generalPlan(snapshot,args);if(plan)return plan;
  if(args.operation==='doc_replace')return expectedDoc(snapshot,args);
  let footprint;try{footprint=JSON.parse(args.footprint);}catch{throw Error('INVALID_GOOGLE_FOOTPRINT');}
  if(!footprint||Array.isArray(footprint)||Object.keys(footprint).sort().join(',')!=='column,row,sheetId'||!Object.values(footprint).every(x=>Number.isSafeInteger(x)&&x>=0)||footprint.row>9999||footprint.column>701)throw Error('INVALID_GOOGLE_FOOTPRINT');
  if(typeof args.expected!=='string'||!args.expected||typeof args.replacement!=='string'||!args.replacement||args.expected===args.replacement||args.expected.length>1000||args.replacement.length>1000||/^[=+@-]/.test(args.expected)||/^[=+@-]/.test(args.replacement)||/[\r\n\x00-\x1f]/.test(args.expected+args.replacement))throw Error('GOOGLE_EXACT_TEXT_FOOTPRINT_REQUIRED');
  const expected=structuredClone(snapshot.content),sheet=expected.sheets?.find(s=>s.properties?.sheetId===footprint.sheetId);
  const cells=[];for(const grid of sheet?.data||[]){const r=footprint.row-(grid.startRow||0),c=footprint.column-(grid.startColumn||0);if(r>=0&&c>=0&&grid.rowData?.[r]?.values?.[c])cells.push(grid.rowData[r].values[c]);}
  if(cells.length!==1||!isDeepStrictEqual(cells[0].userEnteredValue,{stringValue:args.expected})||cells[0].textFormatRuns||cells[0].chipRuns)throw Error('GOOGLE_LITERAL_CELL_REQUIRED');
  const cell=cells[0];cell.userEnteredValue={stringValue:args.replacement};if(cell.effectiveValue)cell.effectiveValue={stringValue:args.replacement};if(Object.hasOwn(cell,'formattedValue'))cell.formattedValue=args.replacement;
  return {expected,footprint};
 }
 async function propose(job,args){
  if(!args||Object.keys(args).sort().join(',')!=='expected,fileId,footprint,operation,replacement'||!/^[A-Za-z0-9_-]{20,200}$/.test(args.fileId))throw Error('INVALID_GOOGLE_REQUEST');
  await checkOutput(job,args.replacement);const before=await snapshot(job,args);expectedChange(before,args);await fence(job);
  const id=crypto.randomUUID();save(id,{owner:job.owner_id,bot:job.bot_id,sourceJob:job.id,args,before,state:'prepared',expires:Date.now()+600000});
  return {proposalId:id,fileId:args.fileId,operation:args.operation,footprint:args.footprint,expected:args.expected,replacement:args.replacement,applied:false,approvalCommand:'/google approve '+id,notice:'No original change yet. Authorise this exact footprint by sending approvalCommand as a new task in this SAME bot within ten minutes. Telegram: /bots N ask then approvalCommand. doc_rewrite replaces the whole named plain-paragraph tab body, variable length/multiple paragraphs; target body formatting may inherit/reset. sheet_values supports typed blank/clear, numeric, boolean, literal and explicit formula matrices, with value-only writes and exact entered-value/style/non-target readback. Computed formula results and conditional display may recalculate. sheet_batch is legacy populated literal strings. Chips/rich-text targets and layout changes are unsupported. No articles, publication or sends. Sheets has no workbook-wide transactional compare-and-swap: pre-write snapshot and post-readback detect conflicts but cannot prevent concurrent overwrites; uncertain outcomes are held without replay.'};
 }
 async function validateApproval(job,id){
  if(!UUID.test(id||'')||job.message!=='/google approve '+id)throw Error('GOOGLE_EXPLICIT_APPROVAL_REQUIRED');
  await fence(job);const p=store.read().nativeProposals?.[id];if(!p||p.owner!==job.owner_id||p.bot!==job.bot_id)throw Error('CAPABILITY_DENIED');
  const g=await workspace.grant(job.owner_id,p.args.fileId,'native');
  if(!isDeepStrictEqual(g,p.before.grant))throw Error('GOOGLE_TARGET_NOT_ASSIGNED');
  if(p.sourceJob===job.id)throw Error('GOOGLE_FRESH_APPROVAL_JOB_REQUIRED');
  if(p.state==='complete'&&p.approvalJob!==job.id)throw Error('GOOGLE_APPROVAL_ALREADY_USED');
  if(!p.before.account||await subject(job.owner_id,p.args.fileId)!==p.before.account)throw Error('GOOGLE_SELF_LINK_REQUIRED');
  return p;
 }
 async function approve(job,id){
  const p=await validateApproval(job,id);
  if(p.state==='complete'){if(p.approvalJob!==job.id)throw Error('GOOGLE_APPROVAL_ALREADY_USED');return p.receipt;}
  if(p.state!=='prepared')throw Error('GOOGLE_OUTCOME_UNCERTAIN_RECONCILE');if(p.expires<Date.now())throw Error('GOOGLE_APPROVAL_EXPIRED');
  const fresh=await snapshot(job,p.args);if(!isDeepStrictEqual(fresh,p.before))throw Error('GOOGLE_SOURCE_CHANGED');
  const plan=expectedChange(fresh,p.args),{expected,footprint}=plan;await checkOutput({...job,message:p.args.expected+' -> '+p.args.replacement},p.args.replacement);
  await workspace.grant(job.owner_id,p.args.fileId,'native');await fence(job);const dispatchDeadline=Date.now()+20000;
  if(!fresh.account||await subject(job.owner_id,p.args.fileId)!==fresh.account)throw Error('GOOGLE_SELF_LINK_REQUIRED');
  // Encrypted full pre-write backup and uncertain-state journal before network.
  if(store.read().nativeProposals?.[id]?.state!=='prepared')throw Error('GOOGLE_OUTCOME_UNCERTAIN_RECONCILE');
  save(id,{...p,state:'dispatched',approvalJob:job.id,dispatchedAt:new Date().toISOString()});
  const sheet=['sheet_replace','sheet_batch','sheet_values','sheet_cells'].includes(p.args.operation);
  const request=plan.requests?{...(sheet?{}:{writeControl:{requiredRevisionId:fresh.content.revisionId}}),requests:plan.requests}:sheet?{requests:[{findReplace:{find:p.args.expected,replacement:p.args.replacement,matchCase:true,matchEntireCell:true,searchByRegex:false,includeFormulas:false,range:{sheetId:footprint.sheetId,startRowIndex:footprint.row,endRowIndex:footprint.row+1,startColumnIndex:footprint.column,endColumnIndex:footprint.column+1}}}]}:{writeControl:{requiredRevisionId:fresh.content.revisionId},requests:[{replaceAllText:{containsText:{text:p.args.expected,matchCase:true},replaceText:p.args.replacement,tabsCriteria:{tabIds:[footprint.tabId]}}}]};
  const beforeDispatch=async()=>{await fence(job);if(await subject(job.owner_id,p.args.fileId)!==fresh.account)throw Error('GOOGLE_SELF_LINK_REQUIRED');const g=await workspace.grant(job.owner_id,p.args.fileId,'native');if(!isDeepStrictEqual(g,fresh.grant))throw Error('GOOGLE_TARGET_NOT_ASSIGNED');if(workspace.dispatchAuthority)await workspace.dispatchAuthority(job,p.args.fileId,fresh.grant,fresh.account);if(job.signal?.aborted||Date.now()>=dispatchDeadline)throw Error('STALE_JOB_LEASE');};
  const nativePurpose=workspace.nativePurpose?await workspace.nativePurpose(job,p.args,{url:sheet?`https://sheets.googleapis.com/v4/spreadsheets/${p.args.fileId}:batchUpdate`:`https://docs.googleapis.com/v1/documents/${p.args.fileId}:batchUpdate`,body:JSON.stringify(request)}):null;
  const dispatchOptions={method:'POST',body:JSON.stringify(request),...(nativePurpose?{nativePurpose}:{}),...(workspace.googleJson?{deadline:dispatchDeadline,beforeDispatch}:{})};
  if(!workspace.googleJson)await beforeDispatch();
  const result=await sourceJson(job.owner_id,p.args.fileId,sheet?`https://sheets.googleapis.com/v4/spreadsheets/${p.args.fileId}:batchUpdate`:`https://docs.googleapis.com/v1/documents/${p.args.fileId}:batchUpdate`,dispatchOptions);
  if(plan.requests?sheet?result.replies?.length!==plan.requests.length||(!plan.typedValues&&result.replies.some(r=>r.findReplace?.occurrencesChanged!==1)):result.replies?.length!==plan.requests.length:(sheet?result.replies?.[0]?.findReplace?.occurrencesChanged:result.replies?.[0]?.replaceAllText?.occurrencesChanged)!==1)throw Error('GOOGLE_NATIVE_READBACK_FAILED');
  const after=await snapshot(job,p.args);
  if(!(plan.verify?plan.verify(after.content):isDeepStrictEqual(clean(after.content),clean(expected)))||!isDeepStrictEqual(after.permissions,fresh.permissions)||!isDeepStrictEqual(after.meta,fresh.meta)||!isDeepStrictEqual(after.grant,fresh.grant)||after.account!==fresh.account)throw Error('GOOGLE_NATIVE_READBACK_FAILED');
  const receipt={fileId:p.args.fileId,proposalId:id,contentReadback:true,nonTargetPreserved:true,aclPreserved:true,originalIdPreserved:true,backupRetained:true,limitation:plan.typedValues?'Typed value/formula-only Sheet editing; entered styles, non-target values/formulas, tabs and ACLs preserved. Computed formula results/display may recalculate. No Sheet CAS: concurrent overwrites are not prevented; uncertain outcomes held without replay. No chips/rich text/layout changes, rendered QA, publication or sends.':plan.requests?(sheet?'Multi-cell literal editing, exact-match per cell, not workbook-wide transactional CAS. No formulas/chips/layout changes, visual QA, publication or sends.':'Whole selected plain-paragraph tab body rewrite, not lossless target formatting. Revision CAS, other tabs/sections preserved. No visual QA, publication or sends.'):'Bounded exact correction, not rendered visual or substantive article QA. No publication or send.'};save(id,{...p,state:'complete',approvalJob:job.id,receipt});return receipt;
 }
 return {propose,approve,validateApproval};
}
module.exports={createNativeOperations};
