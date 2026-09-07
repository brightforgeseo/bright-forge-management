const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker(clients=[]) {
 const events={},shown=[],opened=[];let binding={recipientId:'alice',expiresAt:Date.now()+60000};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/sw.js'),'utf8'),{URL,encodeURIComponent,console,Date,Response,caches:{open:async()=>({match:async()=>binding?new Response(JSON.stringify(binding)):undefined,put:async(k,v)=>{binding=await v.json();},delete:async()=>{binding=null;}})},self:{location:{origin:'https://portal.example.invalid'},addEventListener:(name,fn)=>events[name]=fn,registration:{getNotifications:async()=>[],showNotification:async(t,o)=>shown.push({t,o})},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url)}}});
 return {shown,opened,push:async data=>{let promise;events.push({data:{json:()=>data},waitUntil:p=>promise=p});await promise;},click:async data=>{let promise;events.notificationclick({notification:{data,close(){}},waitUntil:p=>promise=p});await promise;}};
}
test('push clicks never open external payload URLs',async()=>{
 const w=worker();await w.click({recipientId:'alice',url:'https://outside.example.invalid/phishing'});
 assert.equal(new URL(w.opened[0],'https://portal.example.invalid').origin,'https://portal.example.invalid');
});
test('repeated delivery replaces the same card without alerting again',async()=>{
 const w=worker();await w.push({recipientId:'alice',title:'Fixture',tag:'notification-1'});await w.push({recipientId:'alice',title:'Fixture',tag:'notification-1'});
 assert.equal(w.shown[0].o.tag,w.shown[1].o.tag);
 assert.equal(w.shown[1].o.renotify,false);
});
test('unbound and different-recipient pushes never expose content or navigate',async()=>{
 const w=worker();await w.push({title:'Secret'});await w.push({recipientId:'bob',title:'Other secret'});
 assert.equal(w.shown.length,0);
 await w.click({recipientId:'bob',linkView:'TASKS'});assert.equal(w.opened.length,0);
});
module.exports={worker};
