const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker(clients=[]) {
 const events={},shown=[],opened=[];
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/sw.js'),'utf8'),{URL,encodeURIComponent,console,self:{location:{origin:'https://portal.example.invalid'},addEventListener:(name,fn)=>events[name]=fn,registration:{showNotification:async(t,o)=>shown.push({t,o})},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url)}}});
 return {shown,opened,push:async data=>{let promise;events.push({data:{json:()=>data},waitUntil:p=>promise=p});await promise;},click:async data=>{let promise;events.notificationclick({notification:{data,close(){}},waitUntil:p=>promise=p});await promise;}};
}
test('push clicks never open external payload URLs',async()=>{
 const w=worker();await w.click({url:'https://outside.example.invalid/phishing'});
 assert.equal(new URL(w.opened[0],'https://portal.example.invalid').origin,'https://portal.example.invalid');
});
test('repeated delivery replaces the same card without alerting again',async()=>{
 const w=worker();await w.push({title:'Fixture',tag:'notification-1'});await w.push({title:'Fixture',tag:'notification-1'});
 assert.equal(w.shown[0].o.tag,w.shown[1].o.tag);
 assert.equal(w.shown[1].o.renotify,false);
});
module.exports={worker};
