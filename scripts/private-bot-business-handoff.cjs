'use strict';
// New native output only. Separate protected destination capability, no ACL writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {isDeepStrictEqual:equal}=require('node:util');
const {transport}=require('./private-bot-business-google.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{20,200}$/.test(x);
function createBusinessHandoff({api,business,store,destinations,send=transport,checkOutput}){
 const rows=()=>destinations===undefined?JSON.parse(fs.readFileSync(path.join(process.env.HOME||'/home/benecho','state/private-bot-grants/approved-destinations.json'),'utf8')).destinations:destinations;
 function save(op,v){const s=store.read();s.businessExports||={};s.businessExports[op]=v;store.write(s);}
 async function authorise(owner,fileId){
  const binding=await business.binding(owner,fileId);if(!binding)throw Error('GOOGLE_BUSINESS_GRANT_REQUIRED');await business.nativeGrant(owner,fileId);
  const root=binding.resourcePolicy?.nativeRoot;
  if(root){if(!root.canAddChildren||!root.operations.some(x=>x==='create_document'||x==='create_spreadsheet'))throw Error('GOOGLE_DESTINATION_GRANT_REQUIRED');return {binding,destination:{owner,source:fileId,boardId:binding.boardId,lane:binding.lane,folder:root.folder,nativeRoot:root}};}
  let grants;try{grants=rows()}catch{throw Error('GOOGLE_DESTINATION_GRANT_REQUIRED')}
  const matches=Array.isArray(grants)?grants.filter(g=>g.owner===owner&&g.source===fileId&&g.boardId===binding.boardId&&g.lane===binding.lane&&fid(g.folder)):[];
  if(matches.length!==1)throw Error('GOOGLE_DESTINATION_GRANT_REQUIRED');return {binding,destination:structuredClone(matches[0])};
 }
 async function run(owner,p,fence){
  if(!fid(p.fileId)||![p.artifactId,p.botId].every(x=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x)))throw Error('INVALID_GOOGLE_REQUEST');
  const recovering=p.reconcileOperation!==undefined;
  if(recovering&&!/^[0-9a-f]{64}$/.test(p.reconcileOperation))throw Error('INVALID_GOOGLE_REQUEST');
  const {binding,destination}=await authorise(owner,p.fileId);
  const artifacts=await api(`/rest/v1/private_bot_artifacts?id=eq.${p.artifactId}&bot_id=eq.${p.botId}&owner_id=eq.${owner}&select=id,name,format,content,binary_base64,source_file&limit=1`),a=artifacts[0];
  if(artifacts.length!==1||a.id!==p.artifactId||a.source_file||!['txt','md','docx','csv','xlsx'].includes(a.format)||typeof a.content!=='string'||a.content.length>60000||typeof a.name!=='string'||!a.name||a.name.length>200)throw Error('GOOGLE_DERIVED_OUTPUT_REQUIRED');
  if(destination.nativeRoot&&!destination.nativeRoot.operations.includes(['csv','xlsx'].includes(a.format)?'create_spreadsheet':'create_document'))throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');
  await checkOutput({owner_id:owner,message:'Native non-article handoff'},a.content);
  const operationBinding={owner,bot:p.botId,subject:binding.subject,source:p.fileId,folder:destination.folder,artifact:a.id,content:hash(a.content)};
  const artifactBinding={id:a.id,name:a.name,format:a.format,contentHash:hash(a.content)};
  const op=hash(operationBinding);
  // Explicit recovery never turns changed input into another creation operation.
  if(recovering&&p.reconcileOperation!==op)throw Error('GOOGLE_RECONCILIATION_BINDING_CHANGED');
  async function authority(){await fence();if(!equal(await authorise(owner,p.fileId),{binding,destination}))throw Error('GOOGLE_DESTINATION_BINDING_CHANGED');await fence(binding);}
  async function request(id,url,options={}){
   await authority();const old=store.read().businessExports?.[op];
   if(![p.fileId,destination.folder].includes(id)&&(!old?.createdId||id!==old.createdId))throw Error('GOOGLE_DERIVED_TARGET_DENIED');
   if(options.method==='POST'&&(recovering||id!==destination.folder||url!=='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,mimeType,parents'))throw Error('GOOGLE_DERIVED_WRITE_TARGET_DENIED');
   if(options.method==='POST'&&(!options.deadline||options.deadline-Date.now()<=16000))throw Error('STALE_JOB_LEASE');
   const r=await send({lane:binding.lane,fileId:id,url,method:options.method||'GET',...options},options.method==='POST'?authority:undefined);await authority();return r;
  }
  const metadata=id=>request(id,`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id,name,mimeType,parents,driveId,version,trashed,capabilities(canAddChildren,canEdit)${recovering&&id!==p.fileId&&id!==destination.folder?',appProperties':''}`);
  async function acl(id){const all=[];let page;do{const r=await request(id,`https://www.googleapis.com/drive/v3/files/${id}/permissions?supportsAllDrives=true&pageSize=100&fields=nextPageToken,permissions(id,type,role,emailAddress,domain,allowFileDiscovery,expirationTime,deleted,pendingOwner,permissionDetails)${page?'&pageToken='+encodeURIComponent(page):''}`);if(!Array.isArray(r.permissions)||all.length>1000)throw Error('GOOGLE_ACL_BASELINE_REQUIRED');all.push(...r.permissions);page=r.nextPageToken;}while(page);return all.sort((a,b)=>a.id.localeCompare(b.id));}
  await authority();const old=store.read().businessExports?.[op];
  if(old&&(old.owner!==owner||old.source!==p.fileId||!equal(old.destination,destination)||(old.operationBinding&&!equal(old.operationBinding,operationBinding))||(old.artifactBinding&&!equal(old.artifactBinding,artifactBinding))||(old.binding&&!equal(old.binding,binding))))throw Error('GOOGLE_RECONCILIATION_BINDING_CHANGED');
  if(!recovering&&old?.state==='complete'){await authority();return old.receipt;}
  if(!recovering&&old)throw Error('GOOGLE_OUTCOME_UNCERTAIN_RECONCILE');
  if(recovering&&(!old||!['dispatched','complete'].includes(old.state)||!fid(old.createdId)||old.createdId===p.fileId||old.createdId===destination.folder||!old.sourceBaseline||!old.folderBaseline||!Array.isArray(old.sourceAcl)||!Array.isArray(old.folderAcl)))throw Error('GOOGLE_OUTCOME_UNCERTAIN_RECONCILE');
  // Recovery must use the genuine retained baseline, never a new pre-write one.
  const source=recovering?old.sourceBaseline:await metadata(p.fileId),folder=recovering?old.folderBaseline:await metadata(destination.folder);
  if(source.id!==p.fileId||source.trashed||folder.id!==destination.folder||folder.trashed||folder.mimeType!=='application/vnd.google-apps.folder'||folder.capabilities?.canAddChildren!==true)throw Error('GOOGLE_DESTINATION_GRANT_REQUIRED');
  const sourceAcl=recovering?old.sourceAcl:await acl(p.fileId),folderAcl=recovering?old.folderAcl:await acl(destination.folder);
  const sheet=['csv','xlsx'].includes(a.format),mime='application/vnd.google-apps.'+(sheet?'spreadsheet':'document');
  const styled=require('./private-bot-styled-handoff.cjs').styledArtifact(a);
  const content=styled?styled.projection:sheet?require('./private-bot-files.cjs').safeCsv(a.content):a.content;
  let created;
  if(recovering)created={id:old.createdId};
  else {
  await authority();const deadline=Date.now()+20000;
  // Persist exact source/destination baseline before the sole create dispatch.
  if(store.read().businessExports?.[op])throw Error('GOOGLE_OUTCOME_UNCERTAIN_RECONCILE');
  save(op,{state:'dispatched',owner,source:p.fileId,destination,binding,operationBinding,artifactBinding,writeTarget:{method:'POST',folder:destination.folder,kind:'create-derived'},sourceBaseline:source,sourceAcl,folderBaseline:folder,folderAcl,at:new Date().toISOString()});
  created=await request(destination.folder,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,mimeType,parents',{method:'POST',deadline,body:JSON.stringify({name:a.name.replace(/\.[^.]+$/,''),mimeType:mime,parents:[destination.folder],appProperties:{privateBotOperation:op},content,...(styled?{mediaBase64:styled.mediaBase64,mediaMime:styled.mediaMime}:{})})});
  if(!fid(created.id)||created.mimeType!==mime||!equal(created.parents,[destination.folder]))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
  save(op,{...store.read().businessExports[op],createdId:created.id});
  }
  const final=await metadata(created.id),native=await request(created.id,sheet?(styled?`https://sheets.googleapis.com/v4/spreadsheets/${created.id}?includeGridData=true`:`https://sheets.googleapis.com/v4/spreadsheets/${created.id}/values/A1:ZZ10000?valueRenderOption=FORMATTED_VALUE`):`https://docs.googleapis.com/v1/documents/${created.id}`);
  const actual=styled?require('./private-bot-styled-handoff.cjs').verifyStyled(styled,a.format,native):sheet?native.values:(native.body?.content||[]).flatMap(x=>x.paragraph?.elements||[]).map(x=>x.textRun?.content||'').join('').replace(/\n$/,'');
  const expected=styled?true:sheet?require('./private-bot-csv.cjs').parseCsv(content):content.replace(/\n$/,'');
  const childAcl=await acl(created.id),afterSource=await metadata(p.fileId),afterFolder=await metadata(destination.folder);
  // Folder modified/version can change on child creation; its lineage and ACL cannot.
  const lineage=x=>({id:x.id,mimeType:x.mimeType,parents:x.parents||[],driveId:x.driveId||null,trashed:!!x.trashed});
  const semantics=xs=>xs.map(({type,role,emailAddress,domain,allowFileDiscovery,expirationTime,deleted,pendingOwner})=>({type,role,emailAddress,domain,allowFileDiscovery,expirationTime,deleted,pendingOwner})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const withoutVersion=x=>{const copy={...x};delete copy.version;return copy;};
  const sourceVersionChanged=!equal(source.version,afterSource.version);
  if(!equal(actual,expected)||final.id!==created.id||final.trashed||!equal(final.parents,[destination.folder])||final.mimeType!==mime||(!sheet&&native.documentId!==created.id)||!equal(withoutVersion(source),withoutVersion(afterSource))||!equal(sourceAcl,await acl(p.fileId))||!equal(folderAcl,await acl(destination.folder))||!equal(lineage(folder),lineage(afterFolder))||!equal(folder.capabilities,afterFolder.capabilities)||afterFolder.capabilities?.canAddChildren!==true||!equal(semantics(childAcl),semantics(folderAcl)))throw Error('GOOGLE_NATIVE_READBACK_FAILED');
  if(recovering&&(final.appProperties?.privateBotOperation!==op||final.name!==a.name.replace(/\.[^.]+$/,'')))throw Error('GOOGLE_RECONCILIATION_BINDING_CHANGED');
  await authority();
  // Artifact edits during awaited native reads cannot change the proven output.
  const current=await api(`/rest/v1/private_bot_artifacts?id=eq.${p.artifactId}&bot_id=eq.${p.botId}&owner_id=eq.${owner}&select=id,name,format,content,binary_base64,source_file&limit=1`);
  if(current.length!==1||!equal(current[0],a))throw Error('GOOGLE_RECONCILIATION_BINDING_CHANGED');
  await authority();
  const receipt={created:true,fileId:created.id,url:`https://docs.google.com/${sheet?'spreadsheets':'document'}/d/${created.id}/edit`,operationId:op,sourceId:p.fileId,sourceUnchanged:sourceVersionChanged?null:true,sourceVersionChanged,sourceContentCompared:false,sourceWriteDispatched:false,destinationId:destination.folder,contentReadback:true,aclPreserved:true,permissionsChanged:false,backupRetained:true,...(recovering?{reconciled:true,reconciliationReadOnly:true}:{}),...(sourceVersionChanged?{warning:'Source version changed concurrently; source content was not compared and sourceUnchanged is unknown. The derived output matches the saved artifact. This handoff dispatched no source write.'}:{}),limitation:'Derived native text/cell projection, not lossless DOCX/XLSX layout. Source identity, lineage, capabilities and ACL verified; source body not compared. No publication or sends.'};
  if(styled){receipt.deliveryMode='styled-native-import';receipt.designReadback=true;receipt.limitation='Native OOXML design import; text/table structure and supported heading or sheet header/freeze design checked. No rendered visual acceptance, publication or sends.';}else receipt.deliveryMode='normalised-text-cells';
  save(op,{...store.read().businessExports[op],state:'complete',receipt,childAcl,childBaseline:final});return receipt;
 }
 return {run,authorise};
}
module.exports={createBusinessHandoff};
