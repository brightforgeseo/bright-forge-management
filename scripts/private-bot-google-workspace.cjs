'use strict';
// Own-consent path plus explicitly approved exact-file server business broker.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {authorisedSource}=require('./private-bot-article-adapter.cjs');
const {createBusinessGoogle}=require('./private-bot-business-google.cjs');
const {createBusinessHandoff}=require('./private-bot-business-handoff.cjs');
const {dispatchAuthority}=require('./private-bot-native-authority.cjs');
const HOME=path.join(process.env.HOME||'/home/benecho','state/private-bot-google');
const REDIRECT='https://echo-ben.tailfdbc33.ts.net/?privateGoogleCallback=1';
const SCOPE='openid email https://www.googleapis.com/auth/drive.file';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function diskStore(){
 fs.mkdirSync(HOME,{recursive:true,mode:0o700});const kp=path.join(HOME,'encryption.key');
 if(!fs.existsSync(kp))fs.writeFileSync(kp,crypto.randomBytes(32),{flag:'wx',mode:0o600});
 const key=fs.readFileSync(kp),file=path.join(HOME,'accounts.enc');
 return {read(){if(!fs.existsSync(file))return {};const b=fs.readFileSync(file),c=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString());},write(v){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(JSON.stringify(v)),c.final()]),tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,Buffer.concat([iv,c.getAuthTag(),body]),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}};
}
function loadConfig(){try{const c=JSON.parse(fs.readFileSync(path.join(HOME,'web-client.json'),'utf8')).web;if(c?.client_id&&c.client_secret&&c.redirect_uris?.includes(REDIRECT))return {client_id:c.client_id,client_secret:c.client_secret,redirect_uri:REDIRECT,picker_key:c.picker_api_key,project_number:c.project_number};}catch{}return null;}
function createGoogleWorkspace({api,store=diskStore(),config=loadConfig(),http=fetch,checkOutput=require('./private-bot-article-boundary.cjs').guardOutput,grants,businessTransport,destinations,resources,clientScopes,nativePolicy}={}){
 const jobContext=new (require('node:async_hooks').AsyncLocalStorage)();
 const business=createBusinessGoogle({api,grants,resources,send:businessTransport,clientScopes,nativePolicy,store,context:()=>jobContext.getStore()});
 const handoff=createBusinessHandoff({api,business:{...business,nativeGrant:(owner,id)=>grant(owner,id,'native')},store,checkOutput,send:businessTransport,destinations});
 async function accountSubject(owner,id){const b=await business.binding(owner,id);if(b)return b.subject;await token(owner);return store.read().accounts?.[owner]?.sub;}
 async function googleJson(owner,id,url,options={}){
  const b=await business.binding(owner,id);
  if(b)return business.request(owner,id,url,options);
  const {deadline,beforeDispatch,...requestOptions}=options;const access=await token(owner);
  if(beforeDispatch)await beforeDispatch();
  if(deadline!==undefined&&Date.now()>=deadline)throw Error('STALE_JOB_LEASE');
  return json(url,{...requestOptions,headers:{Authorization:'Bearer '+access,'content-type':'application/json'}});
 }
 const locks=new Set();
 const mutate=fn=>{const s=store.read();const r=fn(s);store.write(s);return r;};
 async function json(url,options={}){const r=await http(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('GOOGLE_REQUIRED_FILE_GRANT_OR_SERVICE_UNAVAILABLE');return r.json();}
 async function identity(owner){const rows=await api(`/rest/v1/private_bot_owners?owner_id=eq.${encodeURIComponent(owner)}&select=email`);if(rows.length!==1)throw Error('CAPABILITY_DENIED');return rows[0].email;}
 async function token(owner){const account=store.read().accounts?.[owner];if(!account||account.email!==await identity(owner))throw Error('GOOGLE_SELF_LINK_REQUIRED');if(account.expires>Date.now()+60000)return account.access;
  if(!config)throw Error('GOOGLE_APP_REGISTRATION_REQUIRED');const t=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:account.refresh,grant_type:'refresh_token'})});
  if(!t.access_token)throw Error('GOOGLE_SELF_LINK_REQUIRED');mutate(s=>{if(s.accounts?.[owner]?.sub!==account.sub)throw Error('GOOGLE_SELF_LINK_REQUIRED');Object.assign(s.accounts[owner],{access:t.access_token,expires:Date.now()+Number(t.expires_in)*1000});});return t.access_token;
 }
 async function drive(owner,id){if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw Error('INVALID_GOOGLE_FILE');return googleJson(owner,id,'https://www.googleapis.com/drive/v3/files/'+id+'?supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,version,trashed,capabilities(canEdit,canAddChildren)');}
 async function grant(owner,id,purpose){
  const resource=await business.binding(owner,id);
  return grantForResource(owner,id,purpose,resource);
 }
 async function grantForResource(owner,id,purpose,resource){
  if(resource?.resourcePolicy){
   if(purpose==='native'){
    if(!resource.resourcePolicy.operations.includes('native'))throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');
    const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');if(boards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
    require('./private-bot-native-authority.cjs').ordinary(boards,resource);
   }
   const {lane,subject,...g}=resource;return g;
  }
  const b=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');const g=authorisedSource(b,owner,id,grants);if(!g)throw Error('GOOGLE_TARGET_NOT_ASSIGNED');
  if(purpose==='native')require('./private-bot-native-authority.cjs').ordinary(b,g);
  return g;
 }
 async function route(owner,action,method,p={},fence=async()=>{}){
  await identity(owner);
  const fields={start:[],complete:['state','code'],picker:[],target:['fileId','folderId'],read:['fileId','range','readMode'],export:['fileId','artifactId','botId','reconcileOperation']};
  if(Object.keys(p).some(k=>!fields[action]?.includes(k)))throw Error('INVALID_GOOGLE_REQUEST');
  if(!action&&method==='GET'){const a=store.read().accounts?.[owner],businessTargets=await business.targets(owner);return {configured:!!config||businessTargets.length>0,connected:!!a||businessTargets.length>0,email:a?.email||null,requiredGrant:'Protected exact assigned file grant and current requester eligibility; approved shared business lanes use server credentials only',targets:[...(store.read().targets?.[owner]||[]),...businessTargets],businessTargetsAvailable:businessTargets.length,accountCapabilityVerified:false,prerequisite:businessTargets.length?'No individual Google login needed for these approved business sources. Exact API capability is checked on use.':config?'Consent with your own approved Google identity; grant the exact assigned source file to this app.':'No approved business source for this requester; own-account Web connection is optional and not configured.'};}
  if(!action&&method==='DELETE'){mutate(s=>{delete s.accounts?.[owner];delete s.targets?.[owner];for(const [k,v] of Object.entries(s.states||{}))if(v.owner===owner)delete s.states[k];});return {disconnected:true};}
  if(method!=='POST')throw Error('INVALID_GOOGLE_REQUEST');
  if(action==='start'){
   if(!config||config.redirect_uri!==REDIRECT)throw Error('GOOGLE_APP_REGISTRATION_REQUIRED');
   const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
   mutate(s=>{s.states||={};for(const [k,v]of Object.entries(s.states))if(v.owner===owner||v.expires<Date.now())delete s.states[k];s.states[hash(state)]={owner,verifier,expires:Date.now()+600000};});
   const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:config.client_id,redirect_uri:REDIRECT,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',login_hint:await identity(owner)}).toString();return {url:u.href};
  }
  if(action==='complete'){
   if(!config||typeof p.state!=='string'||p.state.length>200||typeof p.code!=='string'||p.code.length>4096)throw Error('GOOGLE_STATE_INVALID');
   const saved=mutate(s=>{const a=s.states?.[hash(p.state)];if(!a||a.owner!==owner||a.expires<Date.now())throw Error('GOOGLE_STATE_INVALID');delete s.states[hash(p.state)];return a;});
   const t=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,redirect_uri:REDIRECT,code:p.code,code_verifier:saved.verifier,grant_type:'authorization_code'})});
   if(!t.access_token||!t.refresh_token||!String(t.scope).split(' ').includes('https://www.googleapis.com/auth/drive.file'))throw Error('GOOGLE_REQUIRED_SCOPE');
   const u=await json('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t.access_token}});
   if(u.email_verified!==true||u.email!==await identity(owner)||typeof u.sub!=='string')throw Error('GOOGLE_IDENTITY_MISMATCH');
   mutate(s=>{s.accounts||={};s.accounts[owner]={email:u.email,sub:u.sub,access:t.access_token,refresh:t.refresh_token,expires:Date.now()+Number(t.expires_in)*1000};s.targets||={};s.targets[owner]=[];});return {connected:true,email:u.email};
  }
  if(action==='picker'){
   if(!config?.picker_key||!/^\d+$/.test(config.project_number||''))throw Error('GOOGLE_PICKER_REGISTRATION_REQUIRED');
   return {accessToken:await token(owner),developerKey:config.picker_key,appId:config.project_number};
  }
  if(action==='export'){
   if(await business.binding(owner,p.fileId))return handoff.run(owner,p,fence);
   if(p.reconcileOperation!==undefined)throw Error('GOOGLE_BUSINESS_GRANT_REQUIRED');
   const uuid=/^[0-9a-f-]{36}$/i;if(!uuid.test(p.artifactId||'')||!uuid.test(p.botId||''))throw Error('INVALID_GOOGLE_REQUEST');
   const g=await grant(owner,p.fileId),account=store.read().accounts?.[owner];
   if(!account)throw Error('GOOGLE_SELF_LINK_REQUIRED');
   const target=store.read().targets?.[owner]?.find(t=>t.fileId===p.fileId&&t.account===account.sub&&t.taskId===g.taskId&&t.boardId===g.boardId);
   if(!target)throw Error('GOOGLE_TARGET_SELECTION_REQUIRED');
   const rows=await api(`/rest/v1/private_bot_artifacts?id=eq.${p.artifactId}&bot_id=eq.${p.botId}&owner_id=eq.${owner}&select=id,name,format,content,source_file&limit=1`),a=rows[0];
   if(!a||a.source_file||!['txt','md','docx','csv','xlsx'].includes(a.format))throw Error('GOOGLE_DERIVED_OUTPUT_REQUIRED');
   const op=hash(JSON.stringify({owner,sub:account.sub,file:p.fileId,artifact:a.id,content:hash(a.content)}));
   const old=store.read().exports?.[op];if(old?.state==='complete')return old.receipt;
   if(old||locks.has(op))throw Error('GOOGLE_OUTCOME_UNCERTAIN_RECONCILE');
   locks.add(op);
   try{
    await checkOutput({message:'Native handoff of private non-article output',owner_id:owner},a.content);
    const source=await drive(owner,p.fileId);
    if(source.trashed||source.parents?.length!==1||target.folderId!==source.parents[0])throw Error('GOOGLE_EXACT_DESTINATION_REQUIRED');
    const folder=await drive(owner,source.parents[0]);
    if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||folder.capabilities?.canAddChildren!==true)throw Error('GOOGLE_DESTINATION_GRANT_REQUIRED');
    await grant(owner,p.fileId);const access=await token(owner);
    if(store.read().accounts?.[owner]?.sub!==account.sub)throw Error('GOOGLE_SELF_LINK_REQUIRED');
    const sheet=['csv','xlsx'].includes(a.format),mime=sheet?'application/vnd.google-apps.spreadsheet':'application/vnd.google-apps.document';
    const content=sheet?require('./private-bot-files.cjs').safeCsv(a.content):a.content;
    const boundary='privatebot'+crypto.randomBytes(18).toString('hex');
    const metadata={name:a.name.replace(/\.[^.]+$/,''),mimeType:mime,parents:[folder.id],appProperties:{privateBotOperation:op}};
    const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${sheet?'text/csv':'text/plain'}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    await fence();
    if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
    // Persist dispatch BEFORE network. Any loss blocks replay, including process restart.
    mutate(s=>{s.exports||={};if(s.exports[op])throw Error('GOOGLE_OUTCOME_UNCERTAIN_RECONCILE');s.exports[op]={owner,state:'dispatched',source:p.fileId,folder:folder.id,artifact:a.id,at:new Date().toISOString()};});
    const created=await json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,mimeType,parents',{method:'POST',headers:{Authorization:'Bearer '+access,'content-type':'multipart/related; boundary='+boundary},body:multipart});
    mutate(s=>{s.exports[op].createdId=created.id;});
    if(!/^[A-Za-z0-9_-]{20,200}$/.test(created.id||'')||created.mimeType!==mime)throw Error('GOOGLE_NATIVE_READBACK_FAILED');
    const final=await drive(owner,created.id),original=await drive(owner,p.fileId);
    if(original.id!==source.id||original.version!==source.version||JSON.stringify(original.parents)!==JSON.stringify(source.parents)||final.parents?.[0]!==folder.id||final.parents.length!==1||final.mimeType!==mime)throw Error('GOOGLE_NATIVE_READBACK_FAILED');
    let native;
    if(sheet){native=await json(`https://sheets.googleapis.com/v4/spreadsheets/${created.id}/values/A1:ZZ10000`,{headers:{Authorization:'Bearer '+access}});const expected=require('./private-bot-csv.cjs').parseCsv(content);if(JSON.stringify(native.values)!==JSON.stringify(expected))throw Error('GOOGLE_NATIVE_READBACK_FAILED');}
    else {native=await json(`https://docs.googleapis.com/v1/documents/${created.id}`,{headers:{Authorization:'Bearer '+access}});const body=(native.body?.content||[]).flatMap(x=>x.paragraph?.elements||[]).map(x=>x.textRun?.content||'').join('');if(body.replace(/\n$/,'')!==content.replace(/\n$/,''))throw Error('GOOGLE_NATIVE_READBACK_FAILED');}
    await grant(owner,p.fileId);if(store.read().accounts?.[owner]?.sub!==account.sub)throw Error('GOOGLE_SELF_LINK_REQUIRED');
    const receipt={created:true,fileId:created.id,url:`https://docs.google.com/${sheet?'spreadsheets':'document'}/d/${created.id}/edit`,sourceId:source.id,sourceUnchanged:true,destinationId:folder.id,contentReadback:true,permissionsChanged:false,limitation:'New derived native file. Inherits destination permissions; original file not modified. No rendered visual QA, publishing or send.'};
    mutate(s=>{s.exports[op]={...s.exports[op],state:'complete',receipt};});return receipt;
   }finally{locks.delete(op);}
  }
  if(action==='target'||action==='read'){
   const g=await grant(owner,p.fileId),file=await drive(owner,p.fileId);
   const workbook=g.resourcePolicy?.scope.businessWorkbook===true;
   const office=workbook&&file.mimeType==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
   if(file.trashed||!office&&!['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet'].includes(file.mimeType)||file.id!==p.fileId)throw Error('GOOGLE_NATIVE_TARGET_REQUIRED');
   if(action==='target'){
    const businessBinding=await business.binding(owner,p.fileId);if(businessBinding){if(p.folderId)throw Error('GOOGLE_BUSINESS_DERIVED_HANDOFF_NOT_IMPLEMENTED');return {target:{...g,fileId:file.id,mimeType:file.mimeType,businessAccount:true,lane:businessBinding.lane}};}
    let folderId=null;
    if(p.folderId){const folder=await drive(owner,p.folderId);if(folder.trashed||folder.mimeType!=='application/vnd.google-apps.folder'||folder.capabilities?.canAddChildren!==true||file.parents?.length!==1||file.parents[0]!==p.folderId)throw Error('GOOGLE_DESTINATION_GRANT_REQUIRED');folderId=p.folderId;}
    const target={...g,fileId:file.id,folderId,mimeType:file.mimeType,account:store.read().accounts[owner].sub};
    mutate(s=>{s.targets||={};s.targets[owner]=[...(s.targets[owner]||[]).filter(t=>t.fileId!==file.id),target];});return {target};
   }
   if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
   const account=await accountSubject(owner,p.fileId);let content;
   const onlyKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
   if(office){
    if(p.readMode!==undefined&&!['values','tabs'].includes(p.readMode)||p.readMode==='tabs'&&p.range!==undefined)throw Error('INVALID_GOOGLE_RANGE');
    const data=await googleJson(owner,file.id,`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,{projection:'businessWorkbookV1'});
    if(data.fileId!==file.id||data.representation!=='businessWorkbookV1')throw Error('GOOGLE_NATIVE_READBACK_FAILED');
    if(p.readMode==='tabs')content={sheets:data.sheets.map(s=>({title:s.name,rowCount:s.rows.length,columnCount:Math.max(0,...s.rows.map(r=>r.length))})),withheldTabs:data.withheldTabs,nativeSheetIds:false};
    else {const r=require('./private-bot-business-resources.cjs').rectangle(p.range),sheet=data.sheets.filter(s=>s.name===r.title);if(sheet.length!==1||(r.r2-r.r1+1)*(r.c2-r.c1+1)>10000)throw Error('INVALID_GOOGLE_RANGE');content={range:p.range,values:sheet[0].rows.slice(r.r1-1,r.r2).map(row=>row.slice(r.c1-1,r.c2)),projection:data.projection};}
   }else if(file.mimeType==='application/vnd.google-apps.document'){
    if(p.range!==undefined||p.readMode!==undefined&&!['values','structure'].includes(p.readMode))throw Error('INVALID_GOOGLE_RANGE');
    content=await googleJson(owner,file.id,`https://docs.googleapis.com/v1/documents/${file.id}?includeTabsContent=true`);
    if(content.documentId!==file.id)throw Error('GOOGLE_NATIVE_READBACK_FAILED');
   }else if(p.readMode==='tabs'){
    if(p.range!==undefined)throw Error('INVALID_GOOGLE_RANGE');
    content=await googleJson(owner,file.id,`https://sheets.googleapis.com/v4/spreadsheets/${file.id}?includeGridData=false&fields=spreadsheetId,sheets(properties(sheetId,title,index,gridProperties,hidden))`);
    if(!onlyKeys(content,['spreadsheetId','sheets'])||content.spreadsheetId!==file.id||!Array.isArray(content.sheets)||content.sheets.some(s=>!onlyKeys(s,['properties'])||!onlyKeys(s.properties,['sheetId','title','index','gridProperties','hidden'])||!Number.isSafeInteger(s.properties?.sheetId)||typeof s.properties?.title!=='string'))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
   }else{
    const m=typeof p.range==='string'&&/^(?:'(?:[^'\r\n]|'')+'|[A-Za-z0-9_ ]+)!([A-Z]{1,2})([1-9][0-9]{0,3}):([A-Z]{1,2})([1-9][0-9]{0,3})$/.exec(p.range);
    const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
    if(!m||Number(m[4])<Number(m[2])||col(m[3])<col(m[1])||(Number(m[4])-Number(m[2])+1)*(col(m[3])-col(m[1])+1)>10000)throw Error('INVALID_GOOGLE_RANGE');
    if(p.readMode!==undefined&&!['values','grid','structure'].includes(p.readMode))throw Error('INVALID_GOOGLE_REQUEST');
    let businessHeader,masked=false,verifyVisibility;
    if(workbook){
     const tab=p.range.slice(0,p.range.lastIndexOf('!')),title=tab.startsWith("'")?tab.slice(1,-1).replace(/''/g,"'"):tab;
     const tabs=await route(owner,'read','POST',{fileId:file.id,readMode:'tabs'});
     const selected=tabs.content.sheets.find(s=>s.properties.title===title)?.properties;
     if(!selected)throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');
     const classifier=require('./private-bot-business-classification.cjs');
     const visible=async range=>classifier.visibility(await googleJson(owner,file.id,`https://sheets.googleapis.com/v4/spreadsheets/${file.id}?includeGridData=true&ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent(classifier.VISIBILITY_FIELDS)}`),file.id,require('./private-bot-business-resources.cjs').rectangle(range),selected.sheetId);
     masked=(await visible(p.range)).hidden;
     const headerRange=tab+'!A1:'+(()=>{let n=Math.min(selected.gridProperties.columnCount,200),s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;})()+'1';
     verifyVisibility=async()=>{if((await visible(p.range)).hidden)throw Error('GOOGLE_HIDDEN_RANGE_DENIED');if((await visible(headerRange)).hidden)throw Error('BUSINESS_HEADER_HIDDEN');};
     if(!masked){
     if((await visible(headerRange)).hidden)throw Error('BUSINESS_HEADER_HIDDEN');
     const head=await googleJson(owner,file.id,`https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/${encodeURIComponent(headerRange)}?valueRenderOption=FORMULA`);
     businessHeader=require('./private-bot-business-classification.cjs').safeRows(head.values)[0];
     if(col(m[3])>businessHeader.length)throw Error('BUSINESS_TAB_CLASSIFICATION_REQUIRED');
     }
    }
    if(masked)content={range:p.range,values:[],masked:true,complete:false,reason:'Requested range contains hidden dimensions; no cells returned'};
    else if(['grid','structure'].includes(p.readMode)){
     const metadata=await route(owner,'read','POST',{fileId:file.id,readMode:'tabs'});
     const tab=p.range.slice(0,p.range.lastIndexOf('!')),title=tab.startsWith("'")?tab.slice(1,-1).replace(/''/g,"'"):tab;
     const matches=metadata.content.sheets.filter(s=>s.properties.title===title),sheet=matches[0]?.properties;
     if(matches.length!==1||!Number.isSafeInteger(sheet.gridProperties?.rowCount)||!Number.isSafeInteger(sheet.gridProperties?.columnCount)||Number(m[4])>sheet.gridProperties.rowCount||col(m[3])>sheet.gridProperties.columnCount)throw Error('INVALID_GOOGLE_RANGE');
     const fields=p.readMode==='structure'?'spreadsheetId,sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,userEnteredFormat,note,formattedValue,effectiveFormat(backgroundColor,backgroundColorStyle),hyperlink,textFormatRuns,chipRuns))))':'spreadsheetId,sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue,effectiveFormat(backgroundColor,backgroundColorStyle),hyperlink,textFormatRuns,chipRuns))))';
     content=await googleJson(owner,file.id,`https://sheets.googleapis.com/v4/spreadsheets/${file.id}?includeGridData=true&ranges=${encodeURIComponent(p.range)}&fields=${encodeURIComponent(fields)}`);
     if(!onlyKeys(content,['spreadsheetId','sheets'])||content.spreadsheetId!==file.id||content.sheets?.length!==1||!onlyKeys(content.sheets[0],['properties','data'])||!onlyKeys(content.sheets[0].properties,['sheetId','title'])||content.sheets[0].properties?.sheetId!==sheet.sheetId||content.sheets[0].properties?.title!==title)throw Error('GOOGLE_NATIVE_READBACK_FAILED');
     for(const grid of content.sheets[0].data||[]){
      if(!onlyKeys(grid,['startRow','startColumn','rowData']))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
      const row=grid.startRow||0,column=grid.startColumn||0;
      if(row<Number(m[2])-1||column<col(m[1])-1||row+(grid.rowData?.length||0)>Number(m[4]))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
      for(const r of grid.rowData||[]){
       if(column+(r.values?.length||0)>col(m[3])||Object.keys(r).some(k=>k!=='values'))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
       for(const cell of r.values||[])if(Object.keys(cell).some(k=>!['userEnteredValue','formattedValue','effectiveFormat','hyperlink','textFormatRuns','chipRuns',...(p.readMode==='structure'?['userEnteredFormat','note']:[])].includes(k))||Object.keys(cell.effectiveFormat||{}).some(k=>!['backgroundColor','backgroundColorStyle'].includes(k)))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
       if(businessHeader){const c=require('./private-bot-business-classification.cjs');c.safeText(r);const values=(r.values||[]).map(cell=>{const v=cell.userEnteredValue;if(v===undefined)return cell.formattedValue??null;if(!onlyKeys(v,['stringValue','numberValue','boolValue'])||Object.keys(v).length!==1)throw Error('BUSINESS_TAB_CLASSIFICATION_REQUIRED');return Object.values(v)[0];});c.safeValues(businessHeader,[values],{offset:column,width:col(m[3])-column,height:1,headerRow:row+(grid.rowData||[]).indexOf(r)===0});}
      }
     }
    }else content=await googleJson(owner,file.id,`https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/${encodeURIComponent(p.range)}?valueRenderOption=FORMULA&dateTimeRenderOption=SERIAL_NUMBER`);
    if(businessHeader&&!['grid','structure'].includes(p.readMode)){
     const rectangle=require('./private-bot-business-resources.cjs').rectangle;
     if(!onlyKeys(content,['range','majorDimension','values'])||content.majorDimension!==undefined&&content.majorDimension!=='ROWS'||JSON.stringify(rectangle(content.range))!==JSON.stringify(rectangle(p.range)))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
     require('./private-bot-business-classification.cjs').safeValues(businessHeader,content.values||[],{offset:col(m[1])-1,width:col(m[3])-col(m[1])+1,height:Number(m[4])-Number(m[2])+1,headerRow:Number(m[2])===1});
    }
    if(verifyVisibility&&!masked)await verifyVisibility();
   }
   if(Buffer.byteLength(JSON.stringify(content),'utf8')>160000)throw Error('GOOGLE_CONTENT_LIMIT');
   if(workbook){
    // Bind classification and returned cells to one source revision, including Office projections.
    const validVersion=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
    if(!validVersion(file.version))throw Error('GOOGLE_SOURCE_VERSION_CHANGED');
    const current=await drive(owner,p.fileId);
    if(!validVersion(current.version)||current.version!==file.version||current.id!==file.id||current.mimeType!==file.mimeType||current.trashed||current.driveId!==file.driveId||JSON.stringify(current.parents)!==JSON.stringify(file.parents))throw Error('GOOGLE_SOURCE_VERSION_CHANGED');
   }
   await grant(owner,p.fileId);
   if(!account||await accountSubject(owner,p.fileId)!==account||!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
   return {fileId:file.id,name:file.name,mimeType:file.mimeType,version:file.version,canEdit:file.capabilities?.canEdit===true,grant:g,content,contentReadback:true,readOnly:true};
  }
  throw Error('INVALID_GOOGLE_REQUEST');
 }
 async function jobAuthority(job,fileId,purpose,expectedSubject){
  if(job.signal?.aborted||!job.id||!job.worker_id||!job.bot_id||!await api('/rest/v1/rpc/private_bot_access','POST',{subject:job.owner_id}))throw Error('CAPABILITY_DENIED');
  const rows=await api(`/rest/v1/private_bot_jobs?id=eq.${encodeURIComponent(job.id)}&owner_id=eq.${encodeURIComponent(job.owner_id)}&bot_id=eq.${encodeURIComponent(job.bot_id)}&worker_id=eq.${encodeURIComponent(job.worker_id)}&status=eq.running&lease_expires_at=gt.${encodeURIComponent(new Date(Date.now()+30000).toISOString())}&select=id`);
  if(rows.length!==1||job.signal?.aborted)throw Error('STALE_JOB_LEASE');
  // One coherent binding supplies the grant and account in this validation.
  // Requester/lease checks above and the ordinary-purpose check remain fresh.
  const binding=await business.binding(job.owner_id,fileId);
  const g=await grantForResource(job.owner_id,fileId,purpose,binding);
  if(purpose==='native'&&g.resourcePolicy&&(!g.boardId||g.resourcePolicy.nativeRoot))require('./private-bot-native-authority.cjs').ordinary([],g,job);
  const sub=binding?.subject||await accountSubject(job.owner_id,fileId);
  if(!sub||(expectedSubject&&sub!==expectedSubject))throw Error('GOOGLE_SELF_LINK_REQUIRED');
  return {account:sub,binding};
 }
 async function authoriseJob(job,fileId,purpose,expectedSubject){return (await jobAuthority(job,fileId,purpose,expectedSubject)).account;}
 async function nativePurpose(job,args,request){
  const {account,binding}=await jobAuthority(job,args.fileId,'native');
  if(binding?.resourcePolicy?.nativeRoot||binding?.resourcePolicy?.createdFile){
   if(binding.resourcePolicy.nativeRoot&&!binding.resourcePolicy.nativeRoot.operations.includes(args.operation))throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');
   const validate=async()=>{const current=await jobAuthority(job,args.fileId,'native',account);if(!require('node:util').isDeepStrictEqual(binding,current.binding))throw Error('GOOGLE_BUSINESS_BINDING_CHANGED');};
   return require('./private-bot-native-purpose.cjs').issue(binding,validate,request);
  }
  if(!binding?.resourcePolicy||binding.resourcePolicy.scope.file===true)return null;
  // Resolve the bounded target before any private preservation snapshot.
  if(!['sheet_values','sheet_cells'].includes(args.operation))throw Error('GOOGLE_SCOPED_TYPED_EDIT_REQUIRED');
  let f,b,a;try{f=JSON.parse(args.footprint);b=JSON.parse(args.expected);a=JSON.parse(args.replacement);}catch{throw Error('INVALID_GOOGLE_FOOTPRINT');}
  if(!f||Object.keys(f).sort().join(',')!=='column,row,sheetId'||!Object.values(f).every(v=>Number.isSafeInteger(v)&&v>=0)||!Array.isArray(b)||!b.length||!Array.isArray(a)||a.length!==b.length)throw Error('INVALID_GOOGLE_FOOTPRINT');
  const width=b[0]?.length;if(!width||width>26||b.length>100||width*b.length>500||b.some((r,i)=>!Array.isArray(r)||r.length!==width||!Array.isArray(a[i])||a[i].length!==width))throw Error('GOOGLE_TYPED_MATRIX_REQUIRED');
  const tabs=await route(job.owner_id,'read','POST',{fileId:args.fileId,readMode:'tabs'});
  const sheet=tabs.content.sheets.find(s=>s.properties.sheetId===f.sheetId)?.properties;
  const workbook=binding.resourcePolicy.scope.businessWorkbook===true;
  const allowed=workbook?[{title:sheet?.title,r1:1,c1:1,r2:sheet?.gridProperties?.rowCount,c2:sheet?.gridProperties?.columnCount}]:binding.resourcePolicy.scope.ranges.map(require('./private-bot-business-resources.cjs').rectangle);
  if(!sheet||!allowed.some(r=>r.title===sheet.title&&f.row>=r.r1-1&&f.column>=r.c1-1&&f.row+b.length<=r.r2&&f.column+width<=r.c2))throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');
  if(workbook){
   const col=n=>{let t='';for(n++;n;n=Math.floor((n-1)/26))t=String.fromCharCode(65+(n-1)%26)+t;return t;};
   const tab="'"+sheet.title.replaceAll("'","''")+"'";
   const current=await route(job.owner_id,'read','POST',{fileId:args.fileId,range:`${tab}!${col(f.column)}${f.row+1}:${col(f.column+width-1)}${f.row+b.length}`});
   if(current.content.masked)throw Error('GOOGLE_HIDDEN_RANGE_DENIED');
   const c=require('./private-bot-business-classification.cjs');c.safeText([b,a]);
   const values=a.map(row=>row.map(v=>{if(args.operation!=='sheet_cells')return v;const cell=v?.userEnteredValue;if(!cell)return null;if(Object.keys(cell).length!==1||!['stringValue','numberValue','boolValue'].includes(Object.keys(cell)[0]))throw Error('BUSINESS_TAB_CLASSIFICATION_REQUIRED');return Object.values(cell)[0];}));
   const head=await googleJson(job.owner_id,args.fileId,`https://sheets.googleapis.com/v4/spreadsheets/${args.fileId}/values/${encodeURIComponent(`${tab}!A1:${col(Math.min(sheet.gridProperties.columnCount,200)-1)}1`)}?valueRenderOption=FORMULA`);
   c.safeRows(head.values);c.safeValues(head.values[0],values,{offset:f.column,width,height:b.length,headerRow:false});if(f.row===0)c.safeRows(values);
  }
  // Static grant-bound admission, repeated against snapshot.grant in the plan.
  // Metadata only here: no private cell data or model-supplied authority.
  let formulaCheck;
  for(const row of a)for(const entry of row){const v=args.operation==='sheet_cells'?entry?.userEnteredValue:entry;if(v&&typeof v==='object'&&Object.hasOwn(v,'formulaValue')){
   formulaCheck||=require('./private-bot-sheet-formula.cjs').formulaValidator({grant:binding,content:tabs.content},f.sheetId);formulaCheck(v.formulaValue);
  }}
  const validate=async()=>{await authoriseJob(job,args.fileId,'native',account);if(!require('node:util').isDeepStrictEqual(binding,await business.binding(job.owner_id,args.fileId)))throw Error('GOOGLE_BUSINESS_BINDING_CHANGED');if(workbook){const tab="'"+sheet.title.replaceAll("'","''")+"'",col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;},range=`${tab}!${col(f.column)}${f.row+1}:${col(f.column+width-1)}${f.row+b.length}`;const v=await route(job.owner_id,'read','POST',{fileId:args.fileId,range});if(v.content.masked)throw Error('GOOGLE_HIDDEN_RANGE_DENIED');}};
  await validate();return require('./private-bot-native-purpose.cjs').issue(binding,validate,request);
 }
 async function authoriseRead(owner,args){
  const binding=await business.binding(owner,args.fileId);if(!binding?.resourcePolicy)return;
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${args.fileId}`;
  const url=args.readMode==='tabs'?base+'?includeGridData=false&fields=spreadsheetId,sheets(properties(sheetId,title,index,gridProperties,hidden))':base+'/values/'+encodeURIComponent(args.range||'');
  require('./private-bot-business-resources.cjs').checkRequest(binding,url,{});
 }
 return {runInJob:(job,fn)=>jobContext.run(Object.freeze({owner_id:job.owner_id,bot_id:job.bot_id,id:job.id,worker_id:job.worker_id}),fn),route,drive,grant,token,authoriseJob,accountSubject,googleJson,nativePurpose,authoriseRead,authoriseHandoff:handoff.authorise,dispatchAuthority:(job,fileId,expectedGrant,expectedSubject)=>dispatchAuthority({api,job,fileId,expectedGrant,expectedSubject,business,store,grants})};
}
module.exports={createGoogleWorkspace,diskStore,loadConfig,REDIRECT};
