const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
function load({ready, persistError=null, permission, unsubscribeError=false, deleteError=null, registerWait, subscribeWait, persistWait, unsubscribeWait, deleteWait, fastTimers=false}={}) {
  const calls=[];
  let subscription=null;
  const sub={endpoint:'https://push.example.invalid/device',toJSON:()=>({endpoint:sub.endpoint,keys:{p256dh:'fixture',auth:'fixture'}}),unsubscribe:async()=>{calls.push('unsubscribe');if(unsubscribeWait) await unsubscribeWait;if(unsubscribeError) throw new Error('offline');subscription=null;return true;}};
  const registration={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{calls.push('subscribe');if(subscribeWait) await subscribeWait;subscription=sub;return sub;}}};
  const supabase={from:()=>({upsert:async row=>{calls.push('persist:'+row.user_id);if(persistWait) await persistWait;return {error:persistError};},delete:()=>({eq:async()=>{calls.push('delete');if(deleteWait) await deleteWait;return {error:deleteError};}})})};
  const notification={permission:permission?'default':'granted',requestPermission:()=>{calls.push('permission');return permission || Promise.resolve('granted');}};
  const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/pushNotifications.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,require:n=>n.includes('pushPublicConfig')?{WEB_PUSH_PUBLIC_KEY:'BA'}:{supabase},console:{warn(){},error(){}},window:{PushManager(){},Notification:notification},Notification:notification,navigator:{userAgent:'fixture',serviceWorker:{getRegistration:async()=>{if(registerWait) await registerWait;return registration;},ready:ready||Promise.resolve(registration)}},Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout:fastTimers?(fn,ms)=>setTimeout(fn,Math.min(ms,25)):setTimeout,clearTimeout});
  return {api:exports,calls};
}
test('simultaneous startup and retry share one subscription and save',async()=>{
  const {api,calls}=load();
  const results=await Promise.all([api.enableWebPush('alice'),api.enableWebPush('alice')]);
  assert.ok(results.every(r=>r.ok));
  assert.deepEqual(calls,['subscribe','persist:alice']);
});
test('logout cancels registration waiting for worker readiness',async()=>{
  const ready=deferred(); const {api,calls}=load({ready:ready.promise});
  const pending=api.enableWebPush('alice');
  await new Promise(r=>setImmediate(r));
  const logout=api.disableWebPush();
  ready.resolve();
  await logout;
  assert.equal((await pending).ok,false);
  assert.ok(!calls.includes('persist:alice'));
});
test('logout does not hang if the service worker never becomes ready',async()=>{
  const {api}=load({ready:new Promise(()=>{})});
  api.enableWebPush('alice');
  await new Promise(r=>setImmediate(r));
  const result=await Promise.race([api.disableWebPush().then(()=>true),new Promise(r=>setTimeout(()=>r(false),50))]);
  assert.equal(result,true);
});
test('switching accounts invalidates an older registration',async()=>{
  const ready=deferred(); const {api,calls}=load({ready:ready.promise});
  const alice=api.enableWebPush('alice');
  await new Promise(r=>setImmediate(r));
  const bob=api.enableWebPush('bob');
  ready.resolve();
  assert.equal((await alice).ok,false);
  assert.equal((await bob).ok,true);
  assert.deepEqual(calls,['subscribe','persist:bob']);
});
test('logout cancels a permission prompt that never resolves',async()=>{
 const {api}=load({permission:new Promise(()=>{})});
 const registration=api.enableWebPush('alice',{requestPermission:true});
 const logout=await Promise.race([api.disableWebPush().then(()=>true),new Promise(r=>setTimeout(()=>r(false),100))]);
 assert.equal(logout,true);assert.equal((await registration).ok,false);
});
test('cleanup failures are reported, not mistaken for disabled push',async()=>{
 const {api}=load({unsubscribeError:true,deleteError:'offline'});
 await api.enableWebPush('alice');
 const result=await api.disableWebPush();
 assert.equal(result.ok,false);assert.ok(result.errors.length);
});
for (const stage of ['registerWait','subscribeWait','persistWait']) test(`stalled ${stage} times out without falsely enabling push`,async()=>{
 const {api}=load({[stage]:new Promise(()=>{}),fastTimers:true});
 const result=await api.enableWebPush('alice');assert.equal(result.ok,false);assert.equal(result.reason,'timeout');
});
test('a subscribe resolving after cancellation is compensated and quarantines switches',async()=>{
 const wait=deferred();const {api,calls}=load({subscribeWait:wait.promise});
 const pending=api.enableWebPush('alice');await new Promise(r=>setImmediate(r));
 await api.disableWebPush();assert.equal((await pending).ok,false);
 assert.equal((await api.enableWebPush('bob')).ok,false);
 wait.resolve();await new Promise(r=>setImmediate(r));
 assert.ok(calls.includes('unsubscribe'));assert.ok(!calls.includes('persist:alice'));
});
for (const stage of ['unsubscribeWait','deleteWait']) test(`unresolved ${stage} quarantines registration after cleanup timeout`,async()=>{
 const wait=deferred();const {api}=load({[stage]:wait.promise,fastTimers:true});
 assert.equal((await api.enableWebPush('alice')).ok,true);
 assert.equal((await api.disableWebPush()).ok,false);
 assert.equal((await api.enableWebPush('bob')).ok,false);
 wait.resolve();await new Promise(r=>setImmediate(r));
});
for(const stage of ['unsubscribeWait','deleteWait']) test(`late ${stage} cannot invalidate a successful retry`,async()=>{
 const wait=deferred();const {api,calls}=load({[stage]:wait.promise,fastTimers:true});
 await api.enableWebPush('alice');assert.equal((await api.disableWebPush()).ok,false);
 const result=await api.enableWebPush('alice');assert.equal(result.ok,false);assert.equal(result.reason,'cleanup-failed');
 wait.resolve();await new Promise(r=>setImmediate(r));
});
module.exports={load,deferred};
