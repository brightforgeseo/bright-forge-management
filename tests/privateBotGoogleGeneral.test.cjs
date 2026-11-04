'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeOperations}=require('../scripts/private-bot-google-native.cjs');
const {fixture}=require('./privateBotGoogleNative.test.cjs');
test('general Doc tab rewrite accepts longer multi-paragraph text, preserves other tabs and journals one dispatch',async()=>{
 const f=fixture();let doc={documentId:f.args.fileId,revisionId:'r1',title:'Private fixture',tabs:[{tabProperties:{tabId:'tab'},documentTab:{body:{content:[{endIndex:1,sectionBreak:{}},{startIndex:1,endIndex:12,paragraph:{elements:[{startIndex:1,endIndex:12,textRun:{content:'Old target\n'}}]}}]}}},{tabProperties:{tabId:'other'},documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Untouched\n'}}]}}]}}}]};let posts=0;
 f.http=async(u,o)=>{if(u.includes('/permissions'))return {ok:true,json:async()=>({permissions:[]})};if(o.method==='POST'){posts++;const r=JSON.parse(o.body);assert.equal(r.writeControl.requiredRevisionId,'r1');assert.deepEqual(r.requests[0].deleteContentRange.range,{tabId:'tab',startIndex:1,endIndex:11});assert.equal(r.requests[1].insertText.text,'A longer first paragraph\nAnd a second');doc.tabs[0].documentTab.body.content=[{paragraph:{elements:[{textRun:{content:'A longer first paragraph\nAnd a second\n'}}]}}];doc.revisionId='r2';return {ok:true,json:async()=>({replies:[{},{}]})}}return {ok:true,json:async()=>structuredClone(doc)}};
 const n=createNativeOperations(f),args={...f.args,operation:'doc_rewrite',expected:'Old target\n',replacement:'A longer first paragraph\nAnd a second\n'},p=await n.propose(f.job,args),j={...f.job,id:'approval',message:p.approvalCommand};const r=await n.approve(j,p.proposalId);assert.equal(r.contentReadback,true);assert.equal(r.nonTargetPreserved,true);await n.approve(j,p.proposalId);assert.equal(posts,1);
});
module.exports={};
