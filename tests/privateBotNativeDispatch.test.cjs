'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGoogleWorkspace}=require('../scripts/private-bot-google-workspace.cjs');
const {createNativeOperations}=require('../scripts/private-bot-google-native.cjs');
for(const mode of ['scope','assignment','account','lease','success'])test('actual original-edit consumer final dispatch '+mode,async()=>{
 const owner='staff',fileId='12345678901234567890';let state={},armed=false,revoked=false,posts=0,guards=0;
 const task={id:'task',assignedTo:owner,title:'Ordinary report correction',worksheet:`https://docs.google.com/document/d/${fileId}/edit`};
 const grants=[{owner,source:fileId,boardId:'board',boardName:'Conscient'}];
 let doc={documentId:fileId,revisionId:'r1',tabs:[{tabProperties:{tabId:'tab'},documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Old target\n'}}]}}]}}}]};
 const api=async p=>{if(p.includes('private_bot_google_dispatch_authority'))return {requesterAllowed:true,jobAllowed:!(revoked&&mode==='lease'),board:{id:'board',board_data:{name:'Conscient',groups:[{title:'Ordinary work',tasks:[structuredClone(task)]}]}}};if(p.includes('private_bot_access'))return true;if(p.includes('private_bot_owners'))return [{email:'staff@example.invalid'}];if(p.includes('private_bot_jobs')){if(armed&&mode!=='success'){revoked=true;armed=false;if(mode==='scope')task.title='Change Echo credentials';if(mode==='assignment')task.assignedTo='other';if(mode==='account')grants[0].boardName='Aquip - 10xr';}return revoked&&mode==='lease'?[]:[{id:'job'}]};if(p.includes('client_boards'))return [{id:'board',board_data:{name:'Conscient',groups:[{title:'Ordinary work',tasks:[structuredClone(task)]}]}}];throw Error('UNEXPECTED_API')};
 const store={read:()=>structuredClone(state),write:s=>{state=structuredClone(s)}};
 const businessTransport=async r=>{if(r.method==='POST'){assert.equal(revoked,false,'no write after revocation');posts++;doc.tabs[0].documentTab.body.content[0].paragraph.elements[0].textRun.content='New target\n';doc.revisionId='r2';return {replies:[{replaceAllText:{occurrencesChanged:1}}]};}if(r.url.includes('/permissions'))return {permissions:[]};if(r.url.includes('/drive/'))return {id:fileId,mimeType:'application/vnd.google-apps.document',parents:['folder'],capabilities:{canEdit:true}};return structuredClone(doc)};
 const workspace=createGoogleWorkspace({api,store,config:null,grants,businessTransport}),native=createNativeOperations({api,workspace,store,checkOutput:async()=>{if(++guards===2)armed=true}}),job={id:'job',owner_id:owner,bot_id:'bot',worker_id:'worker'};
 const p=await native.propose(job,{fileId,operation:'doc_replace',footprint:'{"tabId":"tab"}',expected:'Old target',replacement:'New target'}),approval={...job,id:'approval',message:p.approvalCommand};
 if(mode==='success'){assert.equal((await native.approve(approval,p.proposalId)).contentReadback,true);assert.equal(posts,1)}else{await assert.rejects(native.approve(approval,p.proposalId));assert.equal(revoked,true);assert.equal(posts,0)}
});
