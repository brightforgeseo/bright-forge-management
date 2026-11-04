'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {authorisedSource,parseArticleCommand,articleRoute}=require('../scripts/private-bot-article-adapter.cjs');
const owner='owner',source='12345678901234567890';
const grants=[{owner,boardId:'board',source,client:'Client'}];
const boards=[{id:'board',board_data:{name:'Client',groups:[{tasks:[{id:'task',assignedTo:owner,clientSheet:`https://docs.google.com/spreadsheets/d/${source}/edit`}]}]}}];
test('exact assigned source only, not comment or title or another owner',()=>{
 assert.equal(authorisedSource(boards,owner,source,grants).taskId,'task');
 assert.equal(authorisedSource(boards,'foreign',source),null);
 assert.equal(authorisedSource(boards,owner,'other'),null);
 assert.equal(authorisedSource([{board_data:{groups:[{tasks:[{assignedTo:owner,comments:[{text:source}]}]}]}}],owner,source),null);
});
test('article command cannot smuggle paths, programmes, or prose',()=>{
 assert.deepEqual(parseArticleCommand('/article brightforge-clients 123'),{programme:'brightforge-clients',jobId:'123'});
 for(const s of ['/article other 123','/article 10xr ../123','quote /article 10xr 123','/article 10xr 123 rewrite'])assert.equal(parseArticleCommand(s),null);
});
test('unbound article intent never calls generator; positive metadata passes',async()=>{
 const api=async()=>boards;
 assert.match((await articleRoute({message:'renamed buyer guide'},api,{classify:async()=> 'article'})).response,/exact existing/);
 assert.equal(await articleRoute({message:'metadata table'},api,{classify:async()=> 'non_article'}),null);
});
test('canonical result requires exact current assignment and immutable proof',async()=>{
 const job={owner_id:owner,message:'/article brightforge-clients 123'};
 const read=async()=>({programme:'brightforge-clients',jobId:'123',source,status:'handoff_verified',proofVerified:true,docUrl:'https://docs.google.com/document/d/existing/edit',candidateSha256:'abc',tab:'October',cell:'D5',client:'Client'});
 const result=await articleRoute(job,async()=>boards,{read,grants});assert.match(result.response,/existing\/edit/);assert.equal(result.proof.proofVerified,true);
 await assert.rejects(articleRoute({...job,owner_id:'foreign'},async()=>boards,{read,grants}),/ARTICLE_SOURCE_GRANT_REQUIRED/);
 const changed=async()=>({...await read(),proofVerified:false});assert.match((await articleRoute(job,async()=>boards,{read:changed,grants})).response,/not exposed/);
});
