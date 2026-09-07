const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('sidebar persists and dispatches the actual notification destination key',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../components/Sidebar.tsx'),'utf8');
 const body=source.match(/const persistAndDispatch = \(key: string, eventName: string\) => \{([\s\S]*?)\n    \};/)[1];
 const saved=[],events=[];
 const fn=vm.runInNewContext('(key,eventName)=>{'+body+'}',{notificationLinkStorage:{setItem:(...args)=>saved.push(args)},linkData:{taskId:'fixture'},window:{dispatchEvent:e=>events.push(e)},CustomEvent:function(name,data){this.name=name;this.detail=data.detail;}});
 fn('openTaskModal','openTaskModal');assert.equal(saved[0]?.[0],'openTaskModal');assert.equal(events[0]?.detail.taskId,'fixture');
});
