'use strict';
// Server-only company namespace discovery. No board URL, raw query, model lane,
// host path, credentials, shortcut resolution or per-file self-authorisation.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {isDeepStrictEqual:equal}=require('node:util');
const {digest}=require('./private-bot-client-work.cjs');
const {readScopedFile,MIME}=require('./private-bot-files.cjs');
const {rectangle}=require('./private-bot-business-resources.cjs');
const EMAIL={'personal-google':'bensocialbeesmedia@gmail.com','tenxr-google':'analytics@10xr.com.au'};
const ID={test:id=>typeof id==='string'&&id!=='root'&&id.length>=1&&id.length<=200&&!/[^A-Za-z0-9_-]/.test(id)}; // Opaque IDs; never accept the My Drive alias.
const FOLDER='application/vnd.google-apps.folder',DOC='application/vnd.google-apps.document',SHEET='application/vnd.google-apps.spreadsheet';
const FIELDS='id,name,mimeType,parents,driveId,trashed,owners(emailAddress),capabilities(canListChildren,canDownload),size,version';
const {safeText,safeRows,safeValues,privateName}=require('./private-bot-business-classification.cjs');
function readProtected(file){try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o022))throw Error();return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('BUSINESS_DIRECTORY_SOURCE_INVALID');}}
function loadPolicy(){return readProtected(path.join(process.env.HOME,'state/private-bot-grants/company-discovery.json'));}
function loadRegistry(){return readProtected(path.join(process.env.HOME,'.hermes/knowledge/brightforge/client-source-registry.json'));}
function registryFact(r){return {id:r.slug,state:r.state,boardId:r.board_id,profile:r.google_profile};}

function createBusinessDirectory({api,policy,registry,send}){
 const policies=()=>policy===undefined?loadPolicy():typeof policy==='function'?policy():policy;
 const registries=()=>registry===undefined?loadRegistry():typeof registry==='function'?registry():registry;
 const cursors=new Map();
 function source(client,root){
  const p=policies();if(!p||p.version!==1||p.status!=='accepted-company-policy'||p.authority?.kind!=='independent-company-namespace'||!p.authority.evidence?.length||!Array.isArray(p.roots))throw Error('BUSINESS_DIRECTORY_POLICY_REQUIRED');
  const rr=registries()?.clients?.filter(x=>x.slug===client&&x.state==='active');if(rr?.length!==1)throw Error('BUSINESS_DIRECTORY_CLIENT_DENIED');const r=registryFact(rr[0]);
  const rows=p.roots.filter(x=>x.client===client&&x.id===root);if(rows.length!==1)throw Error('BUSINESS_DIRECTORY_ROOT_DENIED');const s=structuredClone(rows[0]);
  if(!ID.test(s.id)||!EMAIL[s.lane]||s.accountEmail!==EMAIL[s.lane]||s.lane!==(r.profile==='tenxr'?'tenxr-google':r.profile==='default'?'personal-google':null)||s.registrySha256!==digest(r)||s.sourceClass!=='business-workspace'||s.accessClass!=='registered-staff'||s.qualification?.status!=='qualified'||!s.qualification.registryEvidence||!s.qualification.namespaceEvidence||!s.qualification.metadataEvidence||!s.namespace||s.namespace.id===s.id||s.namespace.name==='My Drive'||!s.metadata||s.metadata.id!==s.id||!Array.isArray(s.excludedIds))throw Error('BUSINESS_DIRECTORY_SOURCE_INVALID');
  if(!Array.isArray(p.excludedIds||[])||[...s.excludedIds,...(p.excludedIds||[])].some(x=>typeof x!=='string'||!ID.test(x)))throw Error('BUSINESS_DIRECTORY_SOURCE_INVALID');
  s.excludedIds=[...new Set([...s.excludedIds,...(p.excludedIds||[])])];
  return {scope:s,registry:r,policyHash:digest(p)};
 }
 async function bind(job,client,root){
  const before=source(client,root);if(job.signal?.aborted)throw Error('STALE_JOB_LEASE');
  const r=await api('/rest/v1/rpc/private_bot_google_dispatch_authority','POST',{subject:job.owner_id,job_id:job.id,bot:job.bot_id,worker:job.worker_id,board:before.registry.boardId});
  if(r?.requesterAllowed!==true)throw Error('CAPABILITY_DENIED');if(r.jobAllowed!==true||job.signal?.aborted)throw Error('STALE_JOB_LEASE');
  if(!r.board||r.board.id!==before.registry.boardId||r.board.archived)throw Error('BUSINESS_DIRECTORY_CLIENT_REVOKED');
  if(!equal(before,source(client,root)))throw Error('BUSINESS_DIRECTORY_POLICY_CHANGED');return before;
 }
 async function request(job,b,id,url,projection){
  if(!equal(b,await bind(job,b.scope.client,b.scope.id)))throw Error('BUSINESS_DIRECTORY_POLICY_CHANGED');
  const v=await send({lane:b.scope.lane,fileId:id,method:'GET',url,...(projection?{projection}: {})});
  if(!equal(b,await bind(job,b.scope.client,b.scope.id)))throw Error('BUSINESS_DIRECTORY_POLICY_CHANGED');return v;
 }
 const meta=(job,b,id)=>request(job,b,id,`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=${FIELDS}`);
 function checkMeta(b,m){
  if(!m||!ID.test(m.id)||m.trashed||m.mimeType==='application/vnd.google-apps.shortcut'||privateName(m.name,m.mimeType===FOLDER)||b.scope.excludedIds.includes(m.id))throw Error('BUSINESS_DIRECTORY_FILE_DENIED');
  safeText(m.name);
  if((m.driveId||null)!==(b.scope.metadata.driveId||null))throw Error('BUSINESS_DIRECTORY_ACCOUNT_DENIED');
  if(!m.driveId&&(!m.owners?.length||m.owners.some(x=>x.emailAddress!==b.scope.accountEmail)))throw Error('BUSINESS_DIRECTORY_ACCOUNT_DENIED');
  const foreign=policies().roots.some(x=>x.client!==b.scope.client&&x.id===m.id);if(foreign)throw Error('BUSINESS_DIRECTORY_CROSS_CLIENT_DENIED');
 }
 function identity(m){return {id:m.id,name:m.name,mimeType:m.mimeType,parents:m.parents||[],driveId:m.driveId||null,owners:m.owners||[]};}
 async function lineage(job,b,id){
  if(!ID.test(id))throw Error('INVALID_GOOGLE_FILE');const chain=[];let current=id;
  for(let depth=0;depth<9;depth++){
   const m=await meta(job,b,current);checkMeta(b,m);if(m.id!==current)throw Error('BUSINESS_DIRECTORY_FILE_DENIED');chain.push(m);
   if(current===b.scope.id){if(!equal(identity(m),identity(b.scope.metadata)))throw Error('BUSINESS_DIRECTORY_ROOT_CHANGED');
    // Dedicated namespace identity is independent of client aliases and URLs.
    let n=m;for(let i=0;i<8&&n.id!==b.scope.namespace.id;i++){if(n.parents?.length!==1||chain.some(x=>x.id===n.parents[0]))throw Error('BUSINESS_DIRECTORY_NAMESPACE_DENIED');const parent=n.parents[0];n=await meta(job,b,parent);checkMeta(b,n);if(n.id!==parent||n.mimeType!==FOLDER)throw Error('BUSINESS_DIRECTORY_NAMESPACE_DENIED');chain.push(n);}
    if(!equal(identity(n),identity(b.scope.namespace)))throw Error('BUSINESS_DIRECTORY_NAMESPACE_DENIED');return chain;
   }
   if(m.parents?.length!==1||chain.some(x=>x.id===m.parents[0]))throw Error('BUSINESS_DIRECTORY_LINEAGE_DENIED');current=m.parents[0];
  }throw Error('BUSINESS_DIRECTORY_DEPTH_LIMIT');
 }
 async function stable(job,b,id,before){const after=await lineage(job,b,id);if(!equal(before,after))throw Error('BUSINESS_DIRECTORY_SOURCE_CHANGED');}
 async function roots(job){
  const p=policies();if(!p||p.status!=='accepted-company-policy')return {roots:[],notActivated:true};const out=[];let unavailableRoots=0;
  for(const r of p.roots){try{const b=await bind(job,r.client,r.id);await lineage(job,b,r.id);out.push({client:r.client,root:r.id,name:r.metadata.name,lane:r.lane,sourceClass:r.sourceClass});}catch(e){
   // One stale business root must not suppress every other qualified Drive.
   // Identity, lease and policy drift still abort the whole result.
   if(e.message!=='GOOGLE_BUSINESS_SERVICE_UNAVAILABLE')throw e;
   unavailableRoots++;
  }}
  // Revalidate every returned root immediately before exposure.
  for(const r of out)await bind(job,r.client,r.root);
  return {roots:out,unavailableRoots,complete:unavailableRoots===0,contentAccessProven:false};
 }
 async function list(job,args){
  const b=await bind(job,args.client,args.root),id=args.folderId||args.root,chain=await lineage(job,b,id);if(chain[0].mimeType!==FOLDER||chain[0].capabilities?.canListChildren!==true)throw Error('BUSINESS_DIRECTORY_NOT_LISTABLE');
  const query=args.query||'';if(query.length>100||/[\x00-\x1f]/.test(query))throw Error('INVALID_DIRECTORY_QUERY');let page;
  if(args.cursor){const c=cursors.get(args.cursor);if(!c||c.expires<Date.now()||!equal(c.binding,{owner:job.owner_id,bot:job.bot_id,client:args.client,root:args.root,folder:id,query,policy:b.policyHash}))throw Error('BUSINESS_DIRECTORY_CURSOR_DENIED');page=c.token;}
  // Exactly one parent, no global search; filter name locally, never splice query.
  const q=new URLSearchParams({q:`'${id}' in parents and trashed = false`,supportsAllDrives:'true',includeItemsFromAllDrives:'true',pageSize:'50',fields:`nextPageToken,files(${FIELDS})`,...(page?{pageToken:page}:{})});
  const v=await request(job,b,id,'https://www.googleapis.com/drive/v3/files?'+q);if(!Array.isArray(v.files)||v.files.length>50)throw Error('BUSINESS_DIRECTORY_PAGE_INVALID');
  const files=[];for(const m of v.files){try{checkMeta(b,m);if(m.parents?.length!==1||m.parents[0]!==id)continue;if(![FOLDER,DOC,SHEET,...Object.values(MIME)].includes(m.mimeType))continue;if(query&&!m.name.toLowerCase().includes(query.toLowerCase()))continue;files.push({id:m.id,name:m.name,mimeType:m.mimeType,folder:m.mimeType===FOLDER,contentAccessProven:false});}catch{}}
  await stable(job,b,id,chain);let cursor=null;if(v.nextPageToken){if(typeof v.nextPageToken!=='string'||v.nextPageToken.length>4096)throw Error('BUSINESS_DIRECTORY_PAGE_INVALID');cursor=randomUUID();cursors.set(cursor,{token:v.nextPageToken,expires:Date.now()+300000,binding:{owner:job.owner_id,bot:job.bot_id,client:args.client,root:args.root,folder:id,query,policy:b.policyHash}});if(cursors.size>100)cursors.delete(cursors.keys().next().value);}
  return {files,returned:files.length,scanned:v.files.length,hasMore:!!cursor,cursor,folderId:id,contentAccessProven:false};
 }
 async function read(job,args){
  const b=await bind(job,args.client,args.root),chain=await lineage(job,b,args.fileId),m=chain[0];let content;
  if(m.mimeType===DOC&&!args.exportFormat){
   if(args.range!==undefined||args.readMode!==undefined)throw Error('BUSINESS_DIRECTORY_RANGE_DENIED');
   const d=await request(job,b,m.id,`https://docs.googleapis.com/v1/documents/${m.id}?includeTabsContent=true`,'businessDocTextV1');
   if(!d||Object.keys(d).sort().join(',')!=='autogeneratedFields,businessText,complete,documentId,literalTextComplete,renderedTextComplete,representation,wireBytes'||d.documentId!==m.id||d.representation!=='businessDocTextV1'||d.complete!==true||d.literalTextComplete!==true||d.renderedTextComplete!==false||typeof d.businessText!=='string'||!Number.isSafeInteger(d.wireBytes)||d.wireBytes<1||d.wireBytes>4194304)throw Error('BUSINESS_DOC_PROJECTION_INVALID');
   if(!Array.isArray(d.autogeneratedFields)||d.autogeneratedFields.length>1024)throw Error('BUSINESS_DOC_PROJECTION_INVALID');
   let previousOffset=0;
   for(const f of d.autogeneratedFields){if(!f||Object.keys(f).sort().join(',')!=='offsetUtf16,renderedTextAvailable,type'||!['PAGE_NUMBER','PAGE_COUNT'].includes(f.type)||f.renderedTextAvailable!==false||!Number.isSafeInteger(f.offsetUtf16)||f.offsetUtf16<previousOffset||f.offsetUtf16>d.businessText.length)throw Error('BUSINESS_DOC_PROJECTION_INVALID');previousOffset=f.offsetUtf16;}
   if(JSON.stringify(d).length>100000)throw Error('BUSINESS_CONTENT_LIMIT');
   safeText(d);content={text:d.businessText,projection:'Complete literal Doc text; autogenerated fields listed separately; not rendered layout or page counts',literalTextComplete:true,renderedTextComplete:false,autogeneratedFields:d.autogeneratedFields};
  }
  else if(m.mimeType===SHEET&&!args.exportFormat){
   const tabs=await request(job,b,m.id,`https://sheets.googleapis.com/v4/spreadsheets/${m.id}?includeGridData=false&fields=spreadsheetId,sheets(properties(sheetId,title,index,gridProperties,hidden))`);
   const visible=(tabs.sheets||[]).filter(x=>!privateName(x.properties.title,true)&&!x.properties.hidden);
   if(args.readMode==='tabs'){content={sheets:visible.map(x=>x.properties),withheldTabs:(tabs.sheets||[]).length-visible.length};}
   else {const range=rectangle(args.range);if((range.r2-range.r1+1)*(range.c2-range.c1+1)>2000||!visible.some(x=>x.properties.title===range.title))throw Error('BUSINESS_DIRECTORY_RANGE_DENIED');
    const enc=t=>encodeURIComponent(t),tab="'"+range.title.replaceAll("'","''")+"'";
    const header=await request(job,b,m.id,`https://sheets.googleapis.com/v4/spreadsheets/${m.id}/values/${enc(tab+'!A1:Z1')}?valueRenderOption=FORMULA`);const hdr=safeRows(header.values)[0];
    if(range.c2>hdr.length||hdr.slice(range.c1-1,range.c2).some(x=>!String(x??'').trim()))throw Error('BUSINESS_TAB_CLASSIFICATION_REQUIRED');
    const values=await request(job,b,m.id,`https://sheets.googleapis.com/v4/spreadsheets/${m.id}/values/${enc(args.range)}?valueRenderOption=FORMULA`);
    // Never disclose unknown formula dependencies or evaluate network formulas.
    if((values.values||[]).flat().some(x=>typeof x==='string'&&x.startsWith('=')))throw Error('BUSINESS_FORMULA_USE_EXACT_RANGE_GRANT');
    content={range:args.range,values:safeValues(hdr,values.values||[],{offset:range.c1-1,width:range.c2-range.c1+1,height:range.r2-range.r1+1,headerRow:range.r1===1}),classification:'tabular-business-v1',maskedOtherTabs:true};
   }
  }else{
   const format=args.exportFormat||Object.entries(MIME).find(([,v])=>v===m.mimeType)?.[0];
   if(!['docx','xlsx','pdf'].includes(format))throw Error('BUSINESS_BINARY_FORMAT_UNSUPPORTED');
   if(args.exportFormat&&m.mimeType!==DOC)throw Error('BUSINESS_MIXED_WORKBOOK_EXPORT_DENIED');
   if(args.exportFormat&&!['docx','pdf'].includes(format))throw Error('BUSINESS_BINARY_FORMAT_UNSUPPORTED');
   const url=`https://www.googleapis.com/drive/v3/files/${m.id}`+(args.exportFormat?'/export?mimeType='+encodeURIComponent(MIME[format]):'?alt=media&supportsAllDrives=true');
   const v=await request(job,b,m.id,url);if(typeof v.bytesBase64!=='string'||v.bytesBase64.length>160000||v.mimeType?.split(';')[0]!==MIME[format])throw Error('BUSINESS_BINARY_TYPE_MISMATCH');
   content=await readScopedFile({owner_id:job.owner_id,bot_id:job.bot_id},{owner_id:job.owner_id,bot_id:job.bot_id,format,bytes:Buffer.from(v.bytesBase64,'base64')});
   if(format==='xlsx'){for(const s of content.sheets||[])safeRows(s.rows);if(!content.sheets?.length)throw Error('BUSINESS_TAB_CLASSIFICATION_REQUIRED');}
   safeText(content);
  }
  safeText(content);if(JSON.stringify(content).length>100000)throw Error('BUSINESS_CONTENT_LIMIT');await stable(job,b,args.fileId,chain);
  return {fileId:m.id,mimeType:m.mimeType,content,contentReadback:true,accountLane:b.scope.lane,readOnly:true,sourceClass:b.scope.sourceClass};
 }
 return {roots,list,read};
}
module.exports={createBusinessDirectory,registryFact,FIELDS,safeRows};
