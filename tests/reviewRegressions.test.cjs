const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').join(__dirname,'..');
test('Sidebar persists and dispatches the selected destination',()=>{
 const source=fs.readFileSync(root+'/components/Sidebar.tsx','utf8');
 const body=source.match(/const persistAndDispatch = \(key: string, eventName: string\) => \{([\s\S]*?)\n    \};/);
 assert.ok(body);const saved=[],events=[];
 vm.runInNewContext('(key,eventName)=>{'+body[1]+'}',{notificationLinkStorage:{setItem:(...args)=>saved.push(args)},linkData:{taskId:'fixture'},window:{dispatchEvent:e=>events.push(e)},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}})('openTaskModal','openTaskModal');
 assert.equal(saved[0]?.[0],'openTaskModal');assert.equal(events[0]?.type,'openTaskModal');
});
test('sender payload binds the actual target recipient accepted by the worker',async()=>{
 const source=fs.readFileSync(root+'/supabase/functions/send-push/index.ts','utf8');
 const body=source.match(/const payload = JSON.stringify\((\{[\s\S]*?\})\)/)[1];
 const payload=vm.runInNewContext('('+body+')',{userId:'alice',title:'Fixture',body:'fixture',tag:'1',url:'/',linkView:'TASKS',linkData:{taskId:'fixture'}});
 assert.equal(payload.recipientId,'alice');
 const {worker}=require('./serviceWorkerLifecycle.test.cjs');const w=worker();await w.push(payload);assert.equal(w.shown.length,1);
});
