const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
function load({permission='granted', persistError=null, windowKey='BA', configuredKey=''}={}) {
 const calls={permission:0,persist:0};
 const subscription={toJSON:()=>({endpoint:'https://push.example.invalid/test',keys:{p256dh:'fixture',auth:'fixture'}})};
 const registration={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>subscription}};
 const notification={permission,requestPermission:async()=>{calls.permission++;return 'granted';}};
 const supabase={from:()=>({upsert:async()=>{calls.persist++;return {error:persistError};}})};
 const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/pushNotifications.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:name=>name.includes('pushPublicConfig')?{WEB_PUSH_PUBLIC_KEY:configuredKey}:{supabase},console:{log(){},warn(){},error(){}},window:{PushManager:function(){},Notification:notification,VAPID_PUBLIC_KEY:windowKey},Notification:notification,navigator:{userAgent:'fixture',serviceWorker:{getRegistration:async()=>registration,ready:Promise.resolve(registration)}},Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,clearTimeout});
 return {api:exports,calls};
}
test('subscription database failure never reports success',async()=>{
 const {api}=load({persistError:{message:'isolated write rejected'}});
 const result=await api.enableWebPush('sample-user');
 assert.equal(result.ok,false);assert.equal(result.reason,'persist-failed');
});
test('automatic startup never requests notification permission',async()=>{
 const {api,calls}=load({permission:'default'});
 const result=await api.enableWebPush('sample-user');
 assert.equal(calls.permission,0);assert.equal(result.reason,'permission-required');
});
test('explicit user action may request permission and save subscription',async()=>{
 const {api,calls}=load({permission:'default'});
 const result=await api.enableWebPush('sample-user',{requestPermission:true});
 assert.equal(calls.permission,1);assert.equal(calls.persist,1);assert.equal(result.ok,true);
});
test('published public key works without an ambient build environment',async()=>{
 const {api}=load({windowKey:'',configuredKey:'BA'});
 assert.equal((await api.enableWebPush('sample-user')).ok,true);
});
module.exports={load};
