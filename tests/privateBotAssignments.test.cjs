'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ownTasks}=require('../scripts/private-bot-sources.cjs');
const owner='owner';
const cases=[['scalar',owner,true],['coassigned',['foreign',owner],true],['owner only',[owner],true],['foreign',['foreign'],false],['empty',[],false],['null',null,false],['missing',undefined,false],['object',{owner:true},false],['nested',[[owner]],false],['mixed nested',[owner,[owner]],false],['mixed object',[owner,{}],false],['mixed null',[owner,null],false],['mixed number',[owner,1],false],['number',1,false],['boxed',new String(owner),false],['coercion',{toString:()=>owner},false],['substring','prefix-owner',false],['case','OWNER',false],['whitespace',' owner ',false]];
for(const [name,assignedTo,allowed] of cases)test(`task assignment ${name}: exact valid string|string[] only`,()=>{
 const tasks=ownTasks([{id:'b',board_data:{groups:[{tasks:[{id:'t',assignedTo,title:'safe',comments:['SECRET']}]}]}}],owner);
 assert.equal(tasks.length,allowed?1:0);assert.ok(!JSON.stringify(tasks).includes('SECRET'));
});
const {authorisedSource}=require('../scripts/private-bot-article-adapter.cjs');
const source='12345678901234567890',grants=[{owner,boardId:'b',source,client:'Fixture'}];
function sourceBoards(assignedTo){return [{id:'b',board_data:{name:'Fixture',groups:[{tasks:[{id:'t',assignedTo,clientSheet:`https://docs.google.com/spreadsheets/d/${source}/edit`}]}]}}];}
for(const [name,assignedTo,allowed] of cases)test(`approved source assignment ${name}`,()=>{
 assert.equal(authorisedSource(sourceBoards(assignedTo),owner,source,grants)?.taskId||null,allowed?'t':null);
});
test('coassignment never substitutes for independent approved source grant or active board',()=>{
 const boards=sourceBoards(['foreign',owner]);
 for(const denied of [[],[{...grants[0],owner:'foreign'}],[{...grants[0],boardId:'other'}],[{...grants[0],source:'other'}]])assert.equal(authorisedSource(boards,owner,source,denied),null);
 for(const name of ['Paused Fixture','Cancelled Fixture'])assert.equal(authorisedSource([{...boards[0],board_data:{...boards[0].board_data,name}}],owner,source,grants),null);
 assert.equal(authorisedSource([{...boards[0],archived:true}],owner,source,grants),null);
 boards[0].board_data.groups[0].tasks[0].assignedTo=['foreign'];assert.equal(authorisedSource(boards,owner,source,grants),null);
});
test('missing/invalid owner cannot match malformed assignments',()=>{
 for(const owner of [undefined,null,'',1,{},['owner']])assert.deepEqual(ownTasks([{board_data:{groups:[{tasks:[{id:'t',assignedTo:owner}]}]}}],owner),[]);
});
