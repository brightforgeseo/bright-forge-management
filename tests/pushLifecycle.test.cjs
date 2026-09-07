const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
function load({ready, persistError=null}={}) {
  const calls=[];
  let subscription=null;
  const sub={endpoint:'https://push.example.invalid/device',toJSON:()=>({endpoint:sub.endpoint,keys:{p256dh:'fixture',auth:'fixture'}}),unsubscribe:async()=>{calls.push('unsubscribe');subscription=null;return true;}};
  const registration={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{calls.push('subscribe');subscription=sub;return sub;}}};
  const supabase={from:()=>({upsert:async row=>{calls.push('persist:'+row.user_id);return {error:persistError};},delete:()=>({eq:async()=>{calls.push('delete');return {error:null};}})})};
  const notification={permission:'granted',requestPermission:async()=>{calls.push('permission');return 'granted';}};
  const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/pushNotifications.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,require:n=>n.includes('pushPublicConfig')?{WEB_PUSH_PUBLIC_KEY:'BA'}:{supabase},console:{warn(){},error(){}},window:{PushManager(){},Notification:notification},Notification:notification,navigator:{userAgent:'fixture',serviceWorker:{getRegistration:async()=>registration,ready:ready||Promise.resolve(registration)}},Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,clearTimeout});
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
module.exports={load,deferred};
