import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const moduleUrl=new URL('../lib/notificationSession.mjs',import.meta.url);
test('remote revocation and cross-tab signout invalidate cards and stale profile callbacks',async()=>{
 assert.ok(fs.existsSync(moduleUrl),'session coordinator exists');
 const {startNotificationSession}=await import(moduleUrl);
 let listener,valid=true;const calls=[];
 const session={user:{id:'alice',email:'alice@example.invalid'},expires_at:Math.floor(Date.now()/1000)+3600};
 const auth={getSession:async()=>({data:{session}}),getUser:async()=>valid?{data:{user:session.user}}:{error:{status:401}},onAuthStateChange:fn=>{listener=fn;return {data:{subscription:{unsubscribe(){}}}};}};
 const lifecycle=startNotificationSession({auth,onSession:s=>calls.push('session:'+s.user.id),onInvalidate:()=>calls.push('invalidate'),bind:async id=>calls.push('bind:'+id),cleanup:async()=>calls.push('cleanup'),intervalMs:0});
 await lifecycle.check();assert.ok(calls.includes('session:alice'));
 valid=false;await lifecycle.check();assert.deepEqual(calls.slice(-3),['invalidate','bind:null','cleanup']);assert.ok(calls.includes('bind:null'));
 listener('SIGNED_OUT',null);await new Promise(r=>setTimeout(r,0));assert.ok(calls.includes('cleanup'));
 lifecycle.stop();
});
