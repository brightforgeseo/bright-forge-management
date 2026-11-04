'use strict';
// Server-only business account capability. No credentials leave the transport.
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {authorisedSource,approvedGrants}=(()=>{const a=require('./private-bot-article-adapter.cjs');return {...a,approvedGrants:()=>{try{return JSON.parse(fs.readFileSync(path.join(process.env.HOME||'/home/benecho','state/private-bot-grants/approved-sources.json'),'utf8')).grants;}catch{return [];}}};})();
const PERSONAL=new Set(['Bright Forge','Conscient','Global Ardour Recycling Jack','Heating & Plumbing World Jack','Invoke Media Jack','Keanis O','Lost Dutchman Leather','National Pumps And Boilers Jack','Newbury Self Storage','Polar DC','Raw2k Jack','Scrap Car Network Jack','Taobe UK','Venture Ai Simon']);
function laneFor(g){if(typeof g.boardName!=='string')return null;if(/ - 10xr$/i.test(g.boardName)||g.boardName==='Blue Horse Truck Driver Training')return 'tenxr-google';return PERSONAL.has(g.boardName)?'personal-google':null;}
function transport(request,beforeDispatch){return new Promise((resolve,reject)=>{
 const guarded=request.method==='POST';
 if(guarded&&typeof beforeDispatch!=='function')return reject(Error('GOOGLE_DISPATCH_AUTHORITY_REQUIRED'));
 const runtime=require('./private-bot-google-runtime.cjs');
 const child=spawn(runtime.resolvePython(),[path.join(__dirname,'private-bot-business-google.py')],{cwd:__dirname,env:runtime.googleEnvironment(),stdio:['pipe','pipe','pipe']});
 let out='',bytes=0,ready=false,gateError;
 const timer=setTimeout(()=>child.kill('SIGKILL'),65000);
 child.stdout.on('data',d=>{
  bytes+=d.length;if(bytes>350000){child.kill('SIGKILL');return;}out+=d;
  if(guarded&&!ready&&out.includes('\n')){
   const i=out.indexOf('\n'),line=out.slice(0,i);out=out.slice(i+1);ready=true;
   if(line!=='{"dispatchReady":true}'){gateError=Error('GOOGLE_BUSINESS_SERVICE_UNAVAILABLE');child.kill('SIGKILL');return;}
   Promise.resolve().then(beforeDispatch).then(()=>child.stdin.end('{"dispatchAllowed":true}\n')).catch(e=>{gateError=e;child.kill('SIGKILL');});
  }
 });
 child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
 child.on('error',()=>{clearTimeout(timer);reject(Error('GOOGLE_BUSINESS_SERVICE_UNAVAILABLE'))});
 child.on('close',code=>{clearTimeout(timer);if(gateError)return reject(gateError);try{const r=JSON.parse(out);if(code||r.error)throw Error();if(!r.value||!r.providerEvidence)throw Error();resolve(require('./private-bot-provider-evidence.cjs').record(r.value,r.providerEvidence));}catch{reject(Error('GOOGLE_BUSINESS_SERVICE_UNAVAILABLE'))}});
 const payload=JSON.stringify({...request,...(guarded?{dispatchHandshake:true}:{})})+'\n';
 if(guarded)child.stdin.write(payload);else child.stdin.end(payload);
});}
const policies=require('./private-bot-business-resources.cjs');
const {createRootAuthority}=require('./private-bot-native-roots.cjs');
function createBusinessGoogle({api,grants,resources,send=transport,clientScopes,nativePolicy,store,context}){
 const roots=createRootAuthority({api,send,clientScopes,nativePolicy});
 const created=store&&context?require('./private-bot-created-files.cjs').createCreatedFiles({store,context,send,sourceBinding:binding,sourceSnapshot:bindingSnapshot,sourceAdmission:async(owner,id,r)=>{
  if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
  const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');
  if(boards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
  return r.binding.resourcePolicy?.nativeRoot?roots.admission(owner,id,boards,r.sourceBaseline,r.folderBaseline):bindingSnapshot(owner,id,boards);
 },sourceCurrent:async(owner,id)=>{
  // Fresh requester and assignment/policy facts, reusing only bounded provider
  // metadata. Final dispatch still takes its own fresh proof + atomic DB RPC.
  if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
  const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');
  if(boards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
  return bindingSnapshot(owner,id,boards);
 }}):null;
 function resourceRows(){return resources===undefined?policies.loadResources():resources;}
 function protectedRows(){const rows=grants===undefined?approvedGrants():grants;return Array.isArray(rows)?rows:[];}
 function bindingSnapshot(owner,fileId,boards){
  if(created?.known(fileId))return created.snapshot(owner,fileId,boards);
  const resource=policies.resolve(resourceRows(),boards,owner,fileId);if(resource)return resource;
  const rows=protectedRows().filter(g=>g.owner===owner&&g.source===fileId),lanes=[...new Set(rows.map(laneFor).filter(Boolean))];
  if(!lanes.length)return roots.snapshot(owner,fileId,boards);if(lanes.length!==1)throw Error('GOOGLE_BUSINESS_LANE_AMBIGUOUS');
  const g=authorisedSource(boards,owner,fileId,rows.filter(x=>laneFor(x)===lanes[0]));if(!g)throw Error('GOOGLE_TARGET_NOT_ASSIGNED');
  return {...g,lane:lanes[0],subject:'business:'+lanes[0]+':'+(lanes[0]==='tenxr-google'?'analytics@10xr.com.au':'bensocialbeesmedia@gmail.com')};
 }
 async function binding(owner,fileId,{fresh=false}={}){
  if(created?.known(fileId))return created.binding(owner,fileId,{fresh});
  if(resourceRows().some(r=>r.fileId===fileId)){
   if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
   const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');if(boards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
   return policies.resolve(resourceRows(),boards,owner,fileId);
  }
  const rows=protectedRows().filter(g=>g.owner===owner&&g.source===fileId);const lanes=[...new Set(rows.map(laneFor).filter(Boolean))];
  if(!lanes.length)return roots.binding(owner,fileId,{fresh});if(lanes.length!==1)throw Error('GOOGLE_BUSINESS_LANE_AMBIGUOUS');
  if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
  const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');
  if(boards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
  const g=authorisedSource(boards,owner,fileId,rows.filter(x=>laneFor(x)===lanes[0]));if(!g)throw Error('GOOGLE_TARGET_NOT_ASSIGNED');
  return {...g,lane:lanes[0],subject:'business:'+lanes[0]+':'+(lanes[0]==='tenxr-google'?'analytics@10xr.com.au':'bensocialbeesmedia@gmail.com')};
 }
 async function request(owner,fileId,url,options={}){
  const before=await binding(owner,fileId);if(!before)throw Error('GOOGLE_BUSINESS_GRANT_REQUIRED');
  policies.checkRequest(before,url,options);
  if(Object.keys(options).some(k=>!['method','body','deadline','beforeDispatch','nativePurpose','projection'].includes(k)))throw Error('INVALID_GOOGLE_REQUEST');
  if(options.projection&&(options.projection!=='businessWorkbookV1'||before.resourcePolicy?.scope.businessWorkbook!==true||url!==`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`||(options.method||'GET')!=='GET'))throw Error('INVALID_GOOGLE_REQUEST');
  const purpose=options.nativePurpose?require('./private-bot-native-purpose.cjs').get(options.nativePurpose,before):null;
  if(purpose)await purpose.validate();
  if(options.method==='POST'&&(!Number.isSafeInteger(options.deadline)||options.deadline-Date.now()<=16000))throw Error('STALE_JOB_LEASE');
  if(options.beforeDispatch){if(typeof options.beforeDispatch!=='function')throw Error('INVALID_GOOGLE_REQUEST');await options.beforeDispatch();}
  if(options.method==='POST'&&options.deadline-Date.now()<=16000)throw Error('STALE_JOB_LEASE');
  const finalAuthority=async()=>{
   if(purpose)await purpose.validate();
   if(JSON.stringify(before)!==JSON.stringify(await binding(owner,fileId,{fresh:!!before.resourcePolicy?.nativeRoot})))throw Error('GOOGLE_BUSINESS_BINDING_CHANGED');
   if(typeof options.beforeDispatch!=='function')throw Error('GOOGLE_DISPATCH_AUTHORITY_REQUIRED');
   await options.beforeDispatch();
   if(Date.now()>=options.deadline)throw Error('STALE_JOB_LEASE');
  };
  const value=await send({lane:before.lane,fileId,url,method:options.method||'GET',...(options.projection?{projection:options.projection}:{}),...(options.deadline===undefined?{}:{deadline:options.deadline}),...(options.body===undefined?{}:{body:options.body})},options.method==='POST'?finalAuthority:undefined);
  const after=await binding(owner,fileId);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('GOOGLE_BUSINESS_BINDING_CHANGED');if(purpose)await purpose.validate();return purpose?value:policies.project(before,value);
 }
 async function targets(owner){
  if(!await api('/rest/v1/rpc/private_bot_access','POST',{subject:owner}))throw Error('CAPABILITY_DENIED');
  const boards=await api('/rest/v1/client_boards?select=id,archived,board_data&archived=eq.false&limit=1000');if(boards.length===1000)throw Error('GOOGLE_ASSIGNMENT_INVENTORY_CAPPED');
  const rows=protectedRows().filter(g=>g.owner===owner&&laneFor(g)&&!resourceRows().some(r=>r.fileId===g.source));const result=[];
  for(const id of new Set(rows.map(g=>g.source))){const lanes=[...new Set(rows.filter(g=>g.source===id).map(laneFor))];if(lanes.length!==1)continue;const g=authorisedSource(boards,owner,id,rows);if(g)result.push({...g,fileId:id,lane:lanes[0],businessAccount:true});}
  for(const id of new Set(resourceRows().filter(r=>r.access?.some(a=>a.owner===owner||a.owner==='registered-staff')).map(r=>r.fileId))){const g=policies.resolve(resourceRows(),boards,owner,id);if(g){const old=result.findIndex(r=>r.fileId===id);if(old!==-1)result.splice(old,1);result.push({...g,fileId:id,businessAccount:true});}}
  return result;
 }
 return {binding,bindingSnapshot,request,targets,refreshDispatchBinding:(owner,fileId)=>binding(owner,fileId,{fresh:true})};
}
module.exports={createBusinessGoogle,laneFor,transport};
