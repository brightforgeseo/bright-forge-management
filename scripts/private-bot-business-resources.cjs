'use strict';
// Protected business catalogue, never model/board supplied. Destination grants
// are intentionally not inputs: create permission is not read/list permission.
const fs=require('node:fs'),path=require('node:path');
const {assignedToOwner}=require('./private-bot-sources.cjs');
const nativePurposes=require('./private-bot-native-purpose.cjs');
const LANES=new Set(['personal-google','tenxr-google']);
function loadResources(){const p=path.join(process.env.HOME||'/home/benecho','state/private-bot-grants/business-resources.json');try{const d=JSON.parse(fs.readFileSync(p,'utf8'));if(d.version!==1||!Array.isArray(d.resources))throw Error();return d.resources;}catch(e){if(e.code==='ENOENT')return [];throw Error('GOOGLE_BUSINESS_REGISTRY_INVALID');}}
function rectangle(a){const m=typeof a==='string'&&/^(?:'((?:[^'\r\n]|'')+)'|([A-Za-z0-9_ ]+))!([A-Z]{1,2})([1-9][0-9]{0,3}):([A-Z]{1,2})([1-9][0-9]{0,3})$/.exec(a);if(!m)throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);const r={title:(m[1]?.replace(/''/g,"'")??m[2]),c1:col(m[3]),r1:Number(m[4]),c2:col(m[5]),r2:Number(m[6])};if(r.c2<r.c1||r.r2<r.r1)throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');return r;}
function resolve(resources,boards,owner,fileId){
 const hits=resources.filter(r=>r.fileId===fileId&&r.access?.some(a=>a.owner===owner||a.owner==='registered-staff'));if(!hits.length){if(resources.some(r=>r.fileId===fileId))throw Error('GOOGLE_RESOURCE_ACCESS_DENIED');return null;}if(hits.length!==1)throw Error('GOOGLE_BUSINESS_RESOURCE_AMBIGUOUS');const r=hits[0];
 const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
 if(!shape(r,['fileId','lane','client','dataClass','authority','access','scope','operations'])||!shape(r.authority,['kind','evidence'])||!Array.isArray(r.access)||r.access.some(a=>!shape(a,['owner','boardId','taskId'])||typeof a.owner!=='string'||!a.owner||['boardId','taskId'].some(k=>a[k]!==undefined&&(typeof a[k]!=='string'||!a[k]))||a.taskId&&!a.boardId))throw Error('GOOGLE_BUSINESS_REGISTRY_INVALID');
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(fileId)||!LANES.has(r.lane)||r.dataClass!=='business'||typeof r.client!=='string'||!r.client||!['authenticated-direct-work','business-registry'].includes(r.authority?.kind)||!Array.isArray(r.authority.evidence)||!r.authority.evidence.length||r.authority.evidence.some(e=>typeof e!=='string'||!e)||!Array.isArray(r.operations)||!r.operations.includes('read')||r.operations.some(x=>!['read','native'].includes(x))||!r.scope)throw Error('GOOGLE_BUSINESS_REGISTRY_INVALID');
 const full=r.scope.file===true&&Object.keys(r.scope).length===1;
 const workbook=r.scope.businessWorkbook===true&&Object.keys(r.scope).length===1;
 if(!full&&!workbook&&(!Array.isArray(r.scope.ranges)||!r.scope.ranges.length||Object.keys(r.scope).length!==1))throw Error('GOOGLE_BUSINESS_REGISTRY_INVALID');
 if(!full&&!workbook)r.scope.ranges.forEach(rectangle);
 const a=r.access.filter(a=>a.owner===owner||a.owner==='registered-staff');if(a.length!==1)throw Error('GOOGLE_BUSINESS_RESOURCE_AMBIGUOUS');let taskId=null;
 if(a[0].boardId){const b=boards.find(b=>b.id===a[0].boardId&&!b.archived&&!/paused|cancelled/i.test(b.board_data?.name||''));const tasks=(b?.board_data?.groups||[]).flatMap(g=>g.tasks||[]).filter(t=>assignedToOwner(t.assignedTo,owner)&&(!a[0].taskId||a[0].taskId===t.id));if(!tasks.length)throw Error('GOOGLE_TARGET_NOT_ASSIGNED');taskId=tasks.map(t=>t.id).sort()[0];}
 else if(r.authority.kind!=='authenticated-direct-work')throw Error('GOOGLE_RESOURCE_AUTHORITY_REQUIRED');

 return {boardId:a[0].boardId||null,taskId,source:fileId,client:r.client,resourcePolicy:structuredClone({scope:r.scope,operations:r.operations,authority:r.authority}),lane:r.lane,subject:'business:'+r.lane+':'+(r.lane==='tenxr-google'?'analytics@10xr.com.au':'bensocialbeesmedia@gmail.com')};
}
function checkRequest(binding,url,options){
 if(!binding.resourcePolicy)return;
 if(options.nativePurpose){
  const p=nativePurposes.get(options.nativePurpose,binding);
  if(!binding.resourcePolicy.operations.includes('native'))throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');
  const u=new URL(url),base='/v4/spreadsheets/'+binding.source;
  if((options.method||'GET')==='GET'&&options.body===undefined&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash){
   if(u.hostname==='sheets.googleapis.com'&&u.pathname===base&&u.search==='?includeGridData=true')return;
   if((binding.resourcePolicy.nativeRoot||binding.resourcePolicy.createdFile)&&u.hostname==='docs.googleapis.com'&&u.pathname==='/v1/documents/'+binding.source&&u.search==='?includeTabsContent=true')return;
   if(u.hostname==='www.googleapis.com'&&u.pathname==='/drive/v3/files/'+binding.source+'/permissions')return;
  }
  if(options.method==='POST'&&p.range?.url===url&&p.range?.body===options.body)return;
  throw Error('GOOGLE_NATIVE_PURPOSE_REQUIRED');
 }
 if(binding.resourcePolicy.scope.file===true){if((options.method||'GET')!=='GET'&&(binding.resourcePolicy.nativeRoot||binding.resourcePolicy.createdFile))throw Error('GOOGLE_NATIVE_PURPOSE_REQUIRED');if((options.method||'GET')!=='GET'&&!binding.resourcePolicy.operations.includes('native'))throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');return;}
 if((options.method||'GET')!=='GET'||options.body!==undefined)throw Error('GOOGLE_RESOURCE_OPERATION_DENIED');
 const u=new URL(url),id=binding.source,base='/v4/spreadsheets/'+id;
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');
 if(u.hostname==='www.googleapis.com'&&u.pathname==='/drive/v3/files/'+id)return;
 if(u.hostname!=='sheets.googleapis.com'||!u.pathname.startsWith(base))throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');
 const q=u.searchParams;
 if(u.pathname===base&&q.get('includeGridData')==='false'&&q.get('fields')==='spreadsheetId,sheets(properties(sheetId,title,index,gridProperties,hidden))'&&[...q.keys()].length===2)return;
 const range=u.pathname.startsWith(base+'/values/')?decodeURIComponent(u.pathname.slice((base+'/values/').length)):u.pathname===base&&q.getAll('ranges').length===1?q.get('ranges'):null;
 const wanted=rectangle(range);
 if(binding.resourcePolicy.scope.businessWorkbook===true){
  if(require('./private-bot-business-classification.cjs').privateName(wanted.title,true)||(wanted.r2-wanted.r1+1)*(wanted.c2-wanted.c1+1)>10000)throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');
  if(u.pathname===base){const c=require('./private-bot-business-classification.cjs'),grid='spreadsheetId,sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue,effectiveFormat(backgroundColor,backgroundColorStyle),hyperlink,textFormatRuns,chipRuns))))';if(q.get('includeGridData')!=='true'||[...q.keys()].sort().join(',')!=='fields,includeGridData,ranges'||![c.VISIBILITY_FIELDS,grid,grid.replace('userEnteredValue,formattedValue','userEnteredValue,userEnteredFormat,note,formattedValue')].includes(q.get('fields')))throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');}
  return;
 }
 const allowed=binding.resourcePolicy.scope.ranges.map(rectangle);
 if(!allowed.some(a=>a.title===wanted.title&&wanted.c1>=a.c1&&wanted.c2<=a.c2&&wanted.r1>=a.r1&&wanted.r2<=a.r2))throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');
}
function project(binding,value){
 if(!binding.resourcePolicy||binding.resourcePolicy.scope.file===true)return value;
 if(binding.resourcePolicy.scope.businessWorkbook===true){
  const {privateName,safeText,safeRows}=require('./private-bot-business-classification.cjs');
  if(value.values){safeText(value.values);if(value.values.flat().some(v=>typeof v==='string'&&/^\s*=/.test(v)))throw Error('BUSINESS_FORMULA_USE_EXACT_RANGE_GRANT');const r=rectangle(value.range);if(r.r1===1)safeRows(value.values);}
  if(value.representation==='businessWorkbookV1'){for(const s of value.sheets||[]){if(privateName(s.name,true))throw Error('GOOGLE_RESOURCE_SCOPE_REQUIRED');safeRows(s.rows);}safeText(value);return value;}
  if(Array.isArray(value.sheets)){const result={...value,sheets:value.sheets.filter(s=>!s.properties?.hidden&&!privateName(s.properties?.title,true))};safeText(result);const walk=v=>{if(!v||typeof v!=='object')return;if(Object.hasOwn(v,'formulaValue'))throw Error('BUSINESS_FORMULA_USE_EXACT_RANGE_GRANT');Object.values(v).forEach(walk);};walk(result);return result;}
  safeText(value);return value;
 }
 if(!Array.isArray(value.sheets))return value;
 const allowed=new Set(binding.resourcePolicy.scope.ranges.map(a=>rectangle(a).title));return {...value,sheets:value.sheets.filter(s=>allowed.has(s.properties?.title))};
}
module.exports={loadResources,resolve,checkRequest,project,rectangle};
