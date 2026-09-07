const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('cold-start push destination waits until authentication finishes',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../App.tsx'),'utf8');
 const effect=source.match(/useEffect\(\(\) => \{\n    if \(typeof window === 'undefined'\) return;([\s\S]*?)\n  \}, \[[^\]]*\]\);/);
 assert.ok(effect);
 const calls=[];
 const context={currentUser:{id:'alice'},isAuthenticated:false,window:{location:{hash:'#push='+encodeURIComponent(JSON.stringify({recipientId:'alice',linkView:'TASKS',linkData:{taskId:'fixture'}})),pathname:'/',search:''}},applyPushDeepLink:()=>calls.push('route'),history:{replaceState:()=>calls.push('consume')},console};
 vm.runInNewContext('(()=>{'+effect[1]+'})()',context);
 assert.deepEqual(calls,[]);
 context.isAuthenticated=true;
 vm.runInNewContext('(()=>{'+effect[1]+'})()',context);
 assert.deepEqual(calls,['route','consume']);
 calls.length=0;context.currentUser.id='bob';
 vm.runInNewContext('(()=>{'+effect[1]+'})()',context);
 assert.deepEqual(calls,['consume']);
});
