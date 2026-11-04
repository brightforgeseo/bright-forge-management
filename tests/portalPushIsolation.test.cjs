const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const flush=()=>new Promise(r=>setTimeout(r,5));
function fixture({lostAck=false,legacy=false,unsubscribeFails=false}={}) {
 const entries=new Map(),shown=[],listeners={},messages=[],opened=[];let unsubscribe=0,unregister=0,closed=0;
 const cache={match:async k=>entries.has(k)?new Response(entries.get(k)):undefined,put:async(k,v)=>entries.set(k,await v.text()),delete:async k=>entries.delete(k)};
 const caches={open:async()=>cache};
 const worker={location:{origin:'https://fixture.invalid'},skipWaiting(){},clients:{claim(){},matchAll:async()=>[],openWindow:async url=>opened.push(url)},registration:{showNotification:async(t,o)=>shown.push({t,...o}),getNotifications:async()=>[]},addEventListener:(t,f)=>listeners[t]=f};
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self:worker,caches,Response,URL,Date,Number,Promise,JSON});
 const active={postMessage(data,ports=[]){messages.push(data);if(legacy){if(!lostAck)ports[0]?.postMessage({ok:true});return;}listeners.message({data,ports:lostAck?[]:ports,source:{url:'https://fixture.invalid/'},waitUntil(p){p.catch(()=>{});}});}};
 const subscription={endpoint:'https://push.fixture.invalid/one',unsubscribe:async()=>{unsubscribe++;return !unsubscribeFails;}};
 const registration={active,pushManager:{getSubscription:async()=>subscription},unregister:async()=>{unregister++;return true;},getNotifications:async()=>[{close(){closed++;}}]};
 class Channel {constructor(){const a={},b={};a.postMessage=data=>queueMicrotask(()=>b.onmessage?.({data}));b.postMessage=data=>queueMicrotask(()=>a.onmessage?.({data}));a.close=b.close=()=>{};this.port1=a;this.port2=b;}}
 const sandbox={exports:{},require(name){if(name==='./supabaseClient')return {supabase:{from(){return {delete(){return {eq:async()=>({error:null})};}}}}};if(name==='./pushPublicConfig')return {WEB_PUSH_PUBLIC_KEY:'fixture'};throw Error(name);},window:{location:{protocol:'https:'},PushManager:{},Notification:{}},navigator:{serviceWorker:{getRegistration:async()=>registration}},Notification:{permission:'denied'},caches,Response,MessageChannel:Channel,console,Promise,Date,Set,Number,Error,Uint8Array,atob,setTimeout:(f,ms)=>setTimeout(f,ms===8000?25:ms),clearTimeout};
 sandbox.crypto=require('node:crypto').webcrypto;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pushNotifications.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 const push=async recipientId=>{let work;listeners.push({data:{json:()=>({recipientId,title:'Fixture',body:'PRIVATE FIXTURE'})},waitUntil:p=>work=p});await work;};
 const click=async recipientId=>{let work;listeners.notificationclick({notification:{close(){},data:{recipientId,linkView:'TASKS',linkData:{taskId:'fixture-task'}}},waitUntil:p=>work=p});await work;};
 return {api:sandbox.exports,entries,shown,push,click,opened,messages,replay:data=>active.postMessage(data),get unsubscribe(){return unsubscribe;},get unregister(){return unregister;},get closed(){return closed;}};
}
test('lost worker ack leaves delivery blocked and cancels old subscription',async()=>{
 const f=fixture({lostAck:true});await assert.rejects(f.api.setPushSession('fixture-a',Date.now()+60000));await flush();await f.push('fixture-a');assert.equal(f.shown.length,0);assert.ok(f.unsubscribe>0);
});
test('current worker binds only verified recipient; clearing blocks payloads',async()=>{
 const f=fixture();await f.api.setPushSession('fixture-a',Date.now()+60000);await f.push('fixture-b');assert.equal(f.shown.length,0);await f.push('fixture-a');assert.equal(f.shown.length,1);await f.api.setPushSession(null,0);await f.push('fixture-a');assert.equal(f.shown.length,1);
});
test('legacy worker cannot be treated as a privacy-capable worker',async()=>{
 const f=fixture({legacy:true});await assert.rejects(f.api.setPushSession('fixture-a',Date.now()+60000));await flush();assert.ok(f.unsubscribe>0);assert.ok(f.unregister>0);
});
test('failed unsubscribe quarantines future web push registration',async()=>{
 const f=fixture({lostAck:true,unsubscribeFails:true});await assert.rejects(f.api.setPushSession('fixture-a',Date.now()+60000));await flush();const result=await f.api.enableWebPush('fixture-b');assert.equal(result.ok,false);await f.push('fixture-a');await f.push('fixture-b');assert.equal(f.shown.length,0);
});
test('logout racing delayed binding cannot re-enable the old identity',async()=>{
 const f=fixture();const a=f.api.setPushSession('fixture-a',Date.now()+60000);const b=f.api.setPushSession(null,0);await Promise.allSettled([a,b]);await f.push('fixture-a');assert.equal(f.shown.length,0);
});
test('lost acknowledgement still closes existing OS cards directly',async()=>{
 const f=fixture({lostAck:true});await assert.rejects(f.api.setPushSession('fixture-a',Date.now()+60000));await flush();assert.ok(f.closed>0);
});
test('legacy persisted binding without a new acknowledged gate cannot deliver',async()=>{
 const f=fixture();f.entries.set('/__push_session__',JSON.stringify({recipientId:'fixture-a',expiresAt:Date.now()+60000}));await f.push('fixture-a');assert.equal(f.shown.length,0);
});
test('late old-owner worker message cannot deliver under the new owner gate',async()=>{
 const f=fixture();await f.api.setPushSession('fixture-a',Date.now()+60000);const stale=f.messages.find(x=>x.recipientId==='fixture-a');await f.api.setPushSession('fixture-b',Date.now()+60000);f.replay(stale);await flush();await f.push('fixture-a');await f.push('fixture-b');assert.equal(f.shown.length,0);
});
test('late old-owner worker message cannot undo logout',async()=>{
 const f=fixture();await f.api.setPushSession('fixture-a',Date.now()+60000);const stale=f.messages.find(x=>x.recipientId==='fixture-a');await f.api.setPushSession(null,0);f.replay(stale);await flush();await f.push('fixture-a');assert.equal(f.shown.length,0);
});
test('a normal identity switch never displays the previous owners payload',async()=>{
 const f=fixture();await f.api.setPushSession('fixture-a',Date.now()+60000);await f.api.setPushSession('fixture-b',Date.now()+60000);await f.push('fixture-a');assert.equal(f.shown.length,0);await f.push('fixture-b');assert.equal(f.shown.length,1);assert.equal(f.shown[0].data.recipientId,'fixture-b');
});
test('foreign and signed-out notification clicks cannot leak a destination',async()=>{
 const f=fixture();await f.api.setPushSession('fixture-b',Date.now()+60000);await f.click('fixture-a');assert.equal(f.opened.length,0);await f.click('fixture-b');assert.equal(f.opened.length,1);await f.api.setPushSession(null,0);await f.click('fixture-b');assert.equal(f.opened.length,1);
});
