'use strict';
const assert=require('node:assert/strict'),root=require('node:path').resolve(__dirname,'..');
const {createGoogleWorkspace}=require(root+'/scripts/private-bot-google-workspace.cjs'),{createNativeOperations}=require(root+'/scripts/private-bot-google-native.cjs');
(async()=>{const results=[];for(const mode of ['requester','job','account','scope','assignment','success']){
 const owner='staff',fileId='12345678901234567890';let state={},posts=0,boardsAfterJournal=0,eligible=true,lease=true,revoked=false;
 const grants=[{owner,source:fileId,boardId:'board',boardName:'Conscient'}],task={id:'task',assignedTo:owner,title:'Ordinary report correction',worksheet:`https://docs.google.com/document/d/${fileId}/edit`};
 const board=()=>({id:'board',board_data:{name:'Conscient',groups:[{title:'Ordinary work',tasks:[structuredClone(task)]}]}});
 let doc={documentId:fileId,revisionId:'r1',tabs:[{tabProperties:{tabId:'tab'},documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Old target\n'}}]}}]}}}]};
 const store={read:()=>structuredClone(state),write:s=>{state=structuredClone(s)}};
 const api=async p=>{
  if(p.includes('private_bot_google_dispatch_authority'))return {requesterAllowed:eligible,jobAllowed:lease,board:board()};
  if(p.includes('private_bot_access'))return eligible;if(p.includes('private_bot_jobs'))return lease?[{id:'job'}]:[];
  if(p.includes('client_boards')){
   if(Object.values(state.nativeProposals||{}).some(x=>x.state==='dispatched')&&++boardsAfterJournal===4&&mode!=='success'){
    revoked=true;if(mode==='requester')eligible=false;if(mode==='job')lease=false;if(mode==='account')grants[0].boardName='Aquip - 10xr';if(mode==='scope')task.title='Change Echo credentials';if(mode==='assignment')task.assignedTo='other';
   }return [board()];
  }throw Error('UNEXPECTED_API '+p);
 };
 const send=async r=>{if(r.method==='POST'){posts++;doc.tabs[0].documentTab.body.content[0].paragraph.elements[0].textRun.content='New target\n';doc.revisionId='r2';return {replies:[{replaceAllText:{occurrencesChanged:1}}]};}if(r.url.includes('/permissions'))return {permissions:[]};if(r.url.includes('/drive/'))return {id:fileId,mimeType:'application/vnd.google-apps.document',parents:['folder'],capabilities:{canEdit:true}};return structuredClone(doc)};
 const w=createGoogleWorkspace({api,store,config:null,grants,businessTransport:send}),n=createNativeOperations({api,workspace:w,store,checkOutput:async()=>{}}),j={id:'job',owner_id:owner,bot_id:'bot',worker_id:'worker'};
 const p=await n.propose(j,{fileId,operation:'doc_replace',footprint:'{"tabId":"tab"}',expected:'Old target',replacement:'New target'});let error;try{await n.approve({...j,id:'approval',message:p.approvalCommand},p.proposalId)}catch(e){error=e.message}
 if(mode==='success')assert.equal(posts,1);else{assert.equal(revoked,true);assert.equal(posts,0,'late authority revocation must dispatch zero writes')};results.push({mode,posts,error:error||null});
 }console.log(JSON.stringify({fixtureOnly:true,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
