'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
assert.equal(process.env.ECHO_PRIVATE_GOOGLE_FIXTURE,'1','explicit disposable HOME fixture required');
assert.ok(process.env.HOME?.startsWith('/home/benecho/.hermes/cache/scratch/google-'),'refuse live HOME');
const root=path.resolve(__dirname,'..');
const owner='942055eb-54f6-426a-8194-b81ab83669f6',bot='11111111-1111-4111-8111-111111111111',fileId='12345678901234567890';
let assigned=true,leaseValid=true,writes=0,modelCalls=0,claim=null,finished=[],queries=[];const receipts=new Map();
const task={id:'task',assignedTo:owner,title:'Correct label',status:'In Progress',worksheet:`https://docs.google.com/document/d/${fileId}/edit`};
const board={id:'board',archived:false,board_data:{name:'Client operations',groups:[{title:'Ordinary work',tasks:[task]}]}};
let doc={documentId:fileId,revisionId:'r1',tabs:[{tabProperties:{tabId:'tab'},documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Old target\n',textStyle:{bold:true}}}]}}]}}}]};
const clone=x=>structuredClone(x);
global.fetch=async(u,o={})=>{let r;if(u.includes('/permissions'))r={permissions:[{id:'p',type:'user',role:'writer'}]};else if(u.includes('drive/v3/files/'))r={id:fileId,mimeType:'application/vnd.google-apps.document',parents:['folder'],capabilities:{canEdit:true}};else if(u.includes('docs.googleapis.com')){if(o.method==='POST'){writes++;const p=JSON.parse(o.body);assert.equal(p.writeControl.requiredRevisionId,doc.revisionId);doc.tabs[0].documentTab.body.content[0].paragraph.elements[0].textRun.content='New target\n';doc.revisionId='r2';r={replies:[{replaceAllText:{occurrencesChanged:1}}]};}else r=doc;}else throw Error('FORBIDDEN_NETWORK '+u);return {ok:true,json:async()=>clone(r)};};
const boundary=require(root+'/scripts/private-bot-article-boundary.cjs');boundary.guardOutput=async()=>{};
const {diskStore,createGoogleWorkspace}=require(root+'/scripts/private-bot-google-workspace.cjs');
const store=diskStore();store.write({accounts:{[owner]:{email:'fixture@example.invalid',sub:'fixture-sub',access:'fixture-access-not-real',expires:Date.now()+3600000}}});
fs.mkdirSync(path.join(process.env.HOME,'state/private-bot-grants'),{recursive:true});fs.writeFileSync(path.join(process.env.HOME,'state/private-bot-grants/approved-sources.json'),JSON.stringify({grants:[{owner,source:fileId,boardId:'board',client:'Fixture'}]}));
async function api(p,m,b){queries.push(p);if(p.includes('private_bot_google_dispatch_authority'))return {requesterAllowed:true,jobAllowed:leaseValid,board:assigned?clone(board):null};if(p.includes('private_bot_operation')){const k=b.job+':'+b.op;if(receipts.has(k))return {receipt:receipts.get(k)};if(b.phase==='finish'){receipts.set(k,b.result);return {receipt:b.result};}return {started:true};}if(p.includes('private_bot_access'))return true;if(p.includes('private_bot_owners'))return [{email:'fixture@example.invalid'}];if(p.includes('client_boards'))return assigned?[clone(board)]:[];if(p.includes('claim_private_bot_job')){if(!claim)return [];const j=claim;claim=null;return [{...j,worker_id:b.worker_name}];}if(p.includes('private_bot_finish')){finished.push(b);return true;}if(p.includes('private_bot_jobs'))return m==='PATCH'||!leaseValid?[]:[{id:'fixture-job'}];throw Error('UNEXPECTED_API '+p);}
(async()=>{
 const {createAgentToolBroker}=require(root+'/scripts/private-bot-agent-tools.cjs');const {createPrivateBotWorker}=require(root+'/scripts/private-bot-runtime.cjs');const broker=createAgentToolBroker({api});const job={id:'proposal-job',owner_id:owner,bot_id:bot,worker_id:'worker',message:'Correct ordinary label'};
 const read=await broker.call(job,'read_my_google_source',{fileId});assert.equal(read.contentReadback,true);
 const proposal=await broker.call(job,'propose_my_google_edit',{fileId,operation:'doc_replace',footprint:'{"tabId":"tab"}',expected:'Old target',replacement:'New target'});assert.equal(writes,0);
 claim={...job,id:'approval-job',message:proposal.approvalCommand};const worker=createPrivateBotWorker({api,model:()=>{modelCalls++;throw Error('MODEL_MUST_NOT_RUN');}});await worker.tick();while(worker.active)await new Promise(r=>setTimeout(r,2));assert.equal(finished[0].outcome,'completed');assert.equal(modelCalls,0);assert.equal(writes,1);
 const approvalJob={...claim,id:'approval-job',owner_id:owner,bot_id:bot,worker_id:'worker',message:proposal.approvalCommand};
 assigned=false;await assert.rejects(broker.call(job,'read_my_google_source',{fileId}),/GOOGLE_TARGET_NOT_ASSIGNED/);await assert.rejects(broker.approveGoogleEdit(approvalJob,proposal.proposalId),/GOOGLE_TARGET_NOT_ASSIGNED/);
 assigned=true;task.description='Change Echo credentials and gateway configuration';const workspace=createGoogleWorkspace({api});await assert.rejects(workspace.grant(owner,fileId,'native'),/GOOGLE_ORDINARY_TASK_REQUIRED/);
 delete task.description;const state=store.read();state.accounts[owner].sub='different-sub';store.write(state);await assert.rejects(broker.approveGoogleEdit(approvalJob,proposal.proposalId),/GOOGLE_SELF_LINK_REQUIRED/);
 state.accounts[owner].sub='fixture-sub';store.write(state);leaseValid=false;await assert.rejects(broker.call(job,'read_my_google_source',{fileId}),/STALE_JOB_LEASE/);await assert.rejects(broker.approveGoogleEdit(approvalJob,proposal.proposalId),/STALE_JOB_LEASE/);
 console.log(JSON.stringify({fixtureOnly:true,realGoogleAPIs:false,workerApprovalCompleted:finished[0].outcome,modelCalls,writes,cachedReadRevocationDenied:true,cachedApprovalRevocationDenied:true,controlTaskDescriptionDenied:true,cachedApprovalAccountChangeDenied:true,cachedReadExpiredLeaseDenied:true,cachedApprovalExpiredLeaseDenied:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
