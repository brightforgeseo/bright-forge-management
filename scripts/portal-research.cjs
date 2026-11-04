'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const {createHash,randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFINITIONS=[
 ['domain-overview','Domain overview','Domain research','Organic keyword distribution and estimated search visibility.',true,false],
 ['competitors','Organic competitors','Domain research','Domains sharing search rankings with the selected website.',true,false],
 ['ranked-keywords','Organic keywords','Domain research','Keywords and pages recorded in the ranking database.',true,false],
 ['keywords','Search volumes','Keywords','Google Ads keyword volumes and bid estimates.',false,true],
 ['keyword-ideas','Keyword ideas','Keywords','Expand seed keywords into relevant search terms.',false,true],
 ['suggestions','Keyword suggestions','Keywords','Suggestions related to one seed phrase.',false,true],
 ['related-keywords','Related keywords','Keywords','Topics connected to a seed keyword.',false,true],
 ['keyword-difficulty','Keyword difficulty','Keywords','Organic difficulty estimates for selected keywords.',false,true],
 ['search-intent','Search intent','Keywords','Recorded informational and commercial search intent.',false,true],
 ['backlink-summary','Backlink overview','Backlinks','Link profile and referring-domain summary.',true,false],
 ['backlinks','Backlinks','Backlinks','Individual observed links, source pages and destinations.',true,false],
 ['referring-domains','Referring domains','Backlinks','Websites linking to the selected domain.',true,false],
 ['anchors','Anchor text','Backlinks','Anchor-text distribution across observed links.',true,false],
 ['backlink-competitors','Link competitors','Backlinks','Domains with overlapping referring websites.',true,false],
 ['serp','Live Google SERP','Live search','Current first-page results for an exact keyword and market.',false,true],
 ['ai-visibility','Prompt visibility','AI visibility','Fixed prompts across ChatGPT and Gemini, with answers, mentions and cited sources.',true,true],
 ['ai-keywords','AI search volumes','AI visibility','Provider estimates of search demand in AI tools.',false,true],
];
const CATALOG=DEFINITIONS.map(([id,label,group,description,target,keywords])=>({id,label,group,description,target,keywords}));
const invalid=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function normalise(body){
 if(!body||typeof body!=='object'||Array.isArray(body))invalid('A query object is required');
 const allowed=new Set(['id','operation','target','keywords','location','language','limit','brand','platforms','fresh','depth']);if(Object.keys(body).some(k=>!allowed.has(k)))invalid('Unsupported query field');
 if(!UUID.test(body.id||''))invalid('A valid request identifier is required');const tool=CATALOG.find(x=>x.id===body.operation);if(!tool)invalid('Unsupported research operation');
 const target=typeof body.target==='string'?body.target.trim().toLowerCase():'';
 if((target||tool.target)&&(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(target)||/\.(local|internal|localhost)$/.test(target)))invalid('Enter an exact public domain without https:// or a path');
 const keywords=body.keywords===undefined?[]:body.keywords;if(!Array.isArray(keywords)||keywords.length>1000||keywords.some(k=>typeof k!=='string'||!k.trim()||k.length>2000))invalid('Invalid keywords or prompts');
 if(tool.keywords&&!keywords.length)invalid('Enter at least one keyword or prompt');
 if(['serp','suggestions','related-keywords'].includes(tool.id)&&keywords.length!==1)invalid('This operation requires one keyword');
 const location=body.location??'Australia',language=body.language??'English',limit=body.limit??20;
 if(typeof location!=='string'||!location.trim()||location.length>150||typeof language!=='string'||!language.trim()||language.length>80)invalid('Choose an explicit market and language');
 if(!Number.isInteger(limit)||limit<1||limit>1000)invalid('Result limit must be between 1 and 1000');
 if(body.fresh!==undefined&&typeof body.fresh!=='boolean')invalid('Invalid fresh-run option');
 const out={id:body.id,operation:tool.id,target,keywords:keywords.map(k=>k.trim()),location:location.trim(),language:language.trim(),limit,fresh:body.fresh===true};
 if(body.depth!==undefined){if(tool.id!=='serp'||!Number.isInteger(body.depth)||body.depth<10||body.depth>100)invalid('SERP depth must be 10 to 100');out.depth=body.depth;}
 if(tool.id==='ai-visibility'){
  if(typeof body.brand!=='string'||body.brand.trim().length<3||body.brand.length>120)invalid('Enter the exact brand name');
  if(keywords.length>10)invalid('Use at most ten prompts per run');out.brand=body.brand.trim();
  out.platforms=body.platforms??['chat_gpt','gemini'];if(!Array.isArray(out.platforms)||!out.platforms.length||out.platforms.length>2||new Set(out.platforms).size!==out.platforms.length||out.platforms.some(x=>!['chat_gpt','gemini'].includes(x)))invalid('Supported prompt platforms are ChatGPT and Gemini');
 }
 return out;
}
function executeResearch(input,{owner,id,root,onProgress}){
 return new Promise((resolve,reject)=>{
  const child=spawn('python3',[path.join(__dirname,'portal-research-runner.py')],{cwd:__dirname,stdio:['pipe','pipe','pipe'],env:Object.fromEntries(['HOME','PATH','LANG','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
  child.stdout.setEncoding('utf8');
  let buffer='',bytes=0,result,error;const timer=setTimeout(()=>{child.kill('SIGKILL');error='OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY';},20*60*1000);timer.unref();
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>12*1024*1024){error='OUTPUT_LIMIT_OUTCOME_UNCERTAIN';child.kill('SIGKILL');return;}buffer+=chunk.toString();let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const item=JSON.parse(line);if(item.type==='result')result=item.result;else if(item.type==='error')error=item.error;else if(item.platform&&item.status)onProgress({platform:item.platform,status:item.status,kind:item.kind});}catch{}}});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.on('error',()=>{error='RESEARCH_PROCESS_UNAVAILABLE';});
  child.on('close',code=>{clearTimeout(timer);if(error||code||!result)return reject(Error(error||'RESEARCH_FAILED_NO_SUCCESS_CLAIM'));resolve(result);});
  child.stdin.end(JSON.stringify({input,owner,id,output:path.join(root,owner,id+'-evidence')}));
 });
}
function createResearchHandler({root=path.join(process.env.HOME||'/home/benecho','state/portal-research'),authenticate,execute=executeResearch}){
 const syncDir=dir=>{const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
 const ensureDir=dir=>{if(fs.existsSync(dir))return;const parent=path.dirname(dir);ensureDir(parent);fs.mkdirSync(dir,{mode:0o700});syncDir(parent);syncDir(dir);};
 ensureDir(root);syncDir(path.dirname(root));syncDir(root);let active=0;const busy=new Set(),volatile=new Map();
 const atomic=(file,value)=>{const tmp=file+'.'+randomUUID()+'.partial';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});let fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
 const fileFor=(owner,id)=>{if(!UUID.test(owner)||!UUID.test(id))invalid('Invalid identifier');return path.join(root,owner,id+'.json');};
 const read=(owner,id)=>{const file=fileFor(owner,id);const memory=volatile.get(owner+':'+id);if(memory)return memory;try{const r=JSON.parse(fs.readFileSync(file,'utf8'));if(r.ownerId!==owner||r.id!==id||typeof r.status!=='string'||typeof r.inputHash!=='string')invalid('Saved research record is inconsistent. Reconcile it before retrying.',503);return r;}catch(e){if(e.code==='ENOENT')return null;if(e.status)throw e;invalid('Saved research record is unreadable. No paid query will be resubmitted.',503);}};
 const save=run=>{const file=fileFor(run.ownerId,run.id);ensureDir(path.dirname(file));syncDir(root);run.revision=(run.revision||0)+1;atomic(file,run);};
 // Never resubmit a potentially paid query after process/service failure.
 for(const dir of fs.readdirSync(root)){if(!UUID.test(dir))continue;for(const name of fs.readdirSync(path.join(root,dir))){if(!name.endsWith('.json')||!UUID.test(name.slice(0,-5)))continue;let run;try{run=read(dir,name.slice(0,-5));}catch{continue;}if(run&&['queued','running'].includes(run.status)){run.status='interrupted';run.error='Service restarted. No paid request was retried. Inspect saved evidence before a fresh run.';run.finishedAt=new Date().toISOString();try{save(run);}catch{volatile.set(run.ownerId+':'+run.id,run);}}}}
 const summarise=run=>{const {result,events,...rest}=run;return {...rest,hasResult:!!result};};
 const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
 const hash=input=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const begin=run=>{
  active++;busy.add(run.ownerId);run.status='running';run.startedAt=new Date().toISOString();
  try{save(run);}catch{active--;busy.delete(run.ownerId);run.status='interrupted';run.error='Durable storage unavailable. No provider query was submitted.';volatile.set(run.ownerId+':'+run.id,run);try{save(run);}catch{}invalid(run.error,503);}
  Promise.resolve().then(()=>execute(run.input,{owner:run.ownerId,id:run.id,root,onProgress:event=>{run.events=[...(run.events||[]),{...event,at:new Date().toISOString()}].slice(-30);try{save(run);}catch{run.persistenceWarning=true;}}})).then(result=>{run.result=result;run.status=result.complete===false?'partial':'completed';}).catch(e=>{run.status=/UNCERTAIN/.test(e.message)?'uncertain':'failed';run.error=/^[A-Z_0-9:; .-]{1,250}$/.test(e.message)?e.message:'Research failed. No successful result is implied.';}).finally(()=>{
   try{run.finishedAt=new Date().toISOString();save(run);}catch{run.status='uncertain';run.error='Result could not be saved. Download the available evidence and reconcile storage before any retry.';run.persistenceWarning=true;volatile.set(run.ownerId+':'+run.id,run);}finally{active--;busy.delete(run.ownerId);}
  }).catch(()=>{});
 };
 const handler=async(req,res)=>{try{
  const origin=req.headers.origin,proto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim();if(origin&&origin!==`${proto}://${req.headers.host}`)return send(res,403,{error:'Same-origin request required'});
  const user=await authenticate(req);if(!user?.id||!UUID.test(user.id))return send(res,401,{error:'Active portal login required'});
  const route=new URL(req.url,'http://localhost').pathname.slice('/api/research'.length).split('/').filter(Boolean);
  if(req.method==='GET'&&route.length===1&&route[0]==='catalog')return send(res,200,{tools:CATALOG,provider:'DataForSEO',method:'Real provider data; estimates and cache age are labelled. No automatic subscriptions.',build:'research-studio-v1'});
  if(route[0]==='runs'&&route.length===1&&req.method==='GET'){const dir=path.join(root,user.id);const rows=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(n=>read(user.id,n.slice(0,-5))).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100):[];return send(res,200,{runs:rows.map(summarise)});}
  if(route[0]==='runs'&&route.length===2&&req.method==='GET'){const run=read(user.id,route[1]);return send(res,run?200:404,run?{run}:{error:'Run not found'});}
  if(route[0]==='runs'&&route.length===1&&req.method==='POST'){
   let text='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)invalid('Request too large',413);text+=chunk;}let body;try{body=JSON.parse(text);}catch{invalid('Invalid JSON');}const input=normalise(body);const old=read(user.id,input.id);
   if(old){if(old.inputHash!==hash(input))invalid('Request identifier already belongs to another query',409);return send(res,200,{run:old});}
   if(active>=2||busy.has(user.id))invalid('A research query is already active. Wait for its saved result.',429);
   const run={id:input.id,ownerId:user.id,input,inputHash:hash(input),status:'queued',createdAt:new Date().toISOString(),events:[]};save(run);begin(run);return send(res,202,{run});
  }
  return send(res,404,{error:'Research route not found'});
 }catch(e){return send(res,e.status||500,{error:e.status?e.message:'Research service unavailable. No result is implied.'});}};
 handler.read=read;return handler;
}
module.exports={createResearchHandler,normalise,CATALOG,executeResearch};
