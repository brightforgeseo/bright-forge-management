'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGoogleWorkspace}=require('../scripts/private-bot-google-workspace.cjs');
const {fixture,fileId,owner}=require('./privateBotBusinessGoogle.test.cjs');
test('business derived handoff uses separate protected destination, private native readback and no replay',async()=>{
 const f=fixture(),folder='folder12345678901234567890',child='created12345678901234567890',artifact='11111111-1111-4111-8111-111111111111',bot='22222222-2222-4222-8222-222222222222';const api=f.api;let posts=0;
 f.destinations=[{owner,source:fileId,folder,boardId:'board',lane:'personal-google'}];
 f.api=async(p,...rest)=>p.includes('private_bot_artifacts')?[{id:artifact,name:'Fixture.txt',format:'txt',content:'Derived non-article fixture',source_file:false}]:api(p,...rest);
 f.businessTransport=async r=>{if(r.method==='POST'){posts++;assert.equal(r.fileId,folder);return {id:child,mimeType:'application/vnd.google-apps.document',parents:[folder]}}if(r.url.includes('/permissions'))return {permissions:[{id:'owner',type:'user',role:'owner',emailAddress:'bensocialbeesmedia@gmail.com'}]};if(r.url.includes('docs.googleapis.com'))return {documentId:r.fileId,body:{content:[{paragraph:{elements:[{textRun:{content:r.fileId===child?'Derived non-article fixture\n':'Source\n'}}]}}]}};return {id:r.fileId,name:'Fixture',mimeType:r.fileId===folder?'application/vnd.google-apps.folder':'application/vnd.google-apps.document',parents:r.fileId===fileId||r.fileId===child?[folder]:[],version:'1',capabilities:{canEdit:true,canAddChildren:true}}};
 f.checkOutput=async()=>{};const w=createGoogleWorkspace(f),args={fileId,artifactId:artifact,botId:bot};const r=await w.route(owner,'export','POST',args);assert.equal(r.contentReadback,true);assert.equal(r.sourceUnchanged,true);assert.equal(r.destinationId,folder);assert.equal(r.aclPreserved,true);assert.deepEqual(await w.route(owner,'export','POST',args),r);assert.equal(posts,1);f.destinations.length=0;await assert.rejects(w.route(owner,'export','POST',args),/DESTINATION/);assert.equal(posts,1);
});
