import test from 'node:test';import assert from 'node:assert/strict';
import {startNotificationSession} from '../lib/notificationSession.mjs';
test('explicit logout suspends remote checks and cannot rebind during cleanup',async()=>{
 let release;const remote=new Promise(r=>release=r),calls=[];
 const session={user:{id:'alice'},expires_at:Math.floor(Date.now()/1000)+3600};
 const auth={getSession:async()=>({data:{session}}),getUser:()=>remote,onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const lifecycle=startNotificationSession({auth,onSession:()=>calls.push('session'),onInvalidate:()=>calls.push('invalid'),bind:async id=>calls.push('bind:'+id),cleanup:async()=>{},intervalMs:0});
 const check=lifecycle.check();await new Promise(r=>setImmediate(r));
 assert.equal(typeof lifecycle.pause,'function');lifecycle.pause();
 release({data:{user:session.user}});await check;await lifecycle.check();
 assert.deepEqual(calls,['invalid']);lifecycle.stop();
});
