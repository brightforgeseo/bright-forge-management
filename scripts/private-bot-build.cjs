'use strict';
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
let boot;
const sha=b=>createHash('sha256').update(b).digest('hex');
function initialise(){
 if(boot)return boot;
 const root=path.resolve(__dirname,'..');
 // Native helpers can otherwise load only after the first proposal. Bind their compiled bytes at bootstrap.
 for(const n of ['private-bot-business-directory.cjs','private-bot-native-authority.cjs','private-bot-native-purpose.cjs','private-bot-native-roots.cjs','private-bot-native-intent.cjs','private-bot-sheet-formula.cjs','private-bot-created-files.cjs','private-bot-rich-native.cjs','private-bot-doc-runs.cjs','private-bot-provider-evidence.cjs','private-bot-styled-handoff.cjs','private-bot-sheet-values.cjs','private-bot-google-general.cjs'])require(path.join(__dirname,n));
 const files=[...new Set([...Object.keys(require.cache).filter(p=>p.startsWith(root+path.sep)&&!p.includes('/node_modules/')),__filename,...['private-bot-model.py','private-bot-connectors.py','private-bot-formats.py','private-bot-article-reader.py','private-bot-article-queue.py','private-bot-article-stages.py','private-bot-business-google.py'].map(n=>path.join(__dirname,n))])].sort();
 // Bind every shipped JS/Python helper, including lazy imports and subprocesses.
 for(const n of fs.readdirSync(__dirname).filter(n=>n.startsWith('private-bot-')&&/\.(cjs|py)$/.test(n)))if(!files.includes(path.join(__dirname,n)))files.push(path.join(__dirname,n));
 for(const n of ['private-bot-local-helper.py','private-bot-local-sandbox.py','private-bot-local-runner.py'])if(!files.includes(path.join(__dirname,n)))files.push(path.join(__dirname,n));
 for(const n of ['private-bot-client-connectors.py','private-bot-client-software.py','private-bot-work-history.py','private-bot-report-reader.py'])files.push(path.join(__dirname,n));
 for(const n of ['echo-worker.cjs','portal-native-work.cjs','portal-native-entry.py','portal-native-payload.py','portal-native-supervisor.py'])files.push(path.join(__dirname,n));
 const modules=Object.fromEntries(files.sort().map(p=>[path.relative(root,p),sha(fs.readFileSync(p))]));
 boot={pid:process.pid,bootedAt:new Date().toISOString(),modules,digest:sha(JSON.stringify(modules))};return boot;
}
function runtimeState(){const b=initialise();const drift=Object.entries(b.modules).filter(([p,h])=>{try{return sha(fs.readFileSync(path.resolve(__dirname,'..',p)))!==h;}catch{return true;}}).map(([p])=>p);return {...b,drift,parity:drift.length===0};}
function assertRuntime(){if(!runtimeState().parity)throw Error('RUNTIME_SOURCE_DRIFT');}
module.exports={initialise,runtimeState,assertRuntime};
