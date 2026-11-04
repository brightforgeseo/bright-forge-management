import test from 'node:test';
import assert from 'node:assert/strict';
import {startNotificationSession} from '../lib/notificationSession.mjs';
const tick=()=>new Promise(r=>setTimeout(r,5));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(overrides={}) {
  let callback; const events=[]; let session={user:{id:'fixture-a',email:'a@example.invalid'},expires_at:Date.now()/1000+3600};
  const auth={getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session?.user}}),onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){}}}};},...overrides.auth};
  const lifecycle=startNotificationSession({auth,intervalMs:0,onSession:s=>events.push(['session',s.user.id]),onInvalidate:()=>events.push(['invalidate']),onNotificationError:()=>events.push(['notification-error']),bind:async(id)=>{events.push(['bind',id]);},cleanup:async()=>{events.push(['cleanup']);return {ok:true,errors:[]};},...overrides,auth});
  return {lifecycle,events,setSession:s=>{session=s;},emit:(event,s=session)=>callback(event,s)};
}
test('accepted server authentication survives lost optional push acknowledgement',async()=>{
 const f=fixture({bind:async(id)=>{if(id)throw Error('optional worker timeout');}});
 await f.lifecycle.check();await tick();f.lifecycle.stop();
 assert.equal(f.events.filter(x=>x[0]==='session').length,1);
 assert.equal(f.events.filter(x=>x[0]==='notification-error').length,1);
 assert.equal(f.events.filter(x=>x[0]==='cleanup').length,1);
});
test('hung optional binding does not hold ordinary login',async()=>{
 const pending=deferred();const f=fixture({bind:()=>pending.promise});
 const checking=f.lifecycle.check();await tick();
 assert.ok(f.events.some(x=>x[0]==='session'));f.lifecycle.stop();pending.resolve();await checking;
});
test('failed GoTrue verification never admits a session',async()=>{
 const f=fixture({auth:{getUser:async()=>({error:Error('revoked'),data:{user:null}})}});await f.lifecycle.check();f.lifecycle.stop();
 assert.ok(!f.events.some(x=>x[0]==='session'));assert.ok(f.events.some(x=>x[0]==='invalidate'));
});
test('missing or non-finite expiry fails closed',async()=>{
 for(const expires_at of [undefined,NaN,Infinity,0]){const f=fixture();f.setSession({user:{id:'fixture-a'},expires_at});await f.lifecycle.check();f.lifecycle.stop();assert.ok(!f.events.some(x=>x[0]==='session'));}
});
test('logout invalidates synchronously and delayed authentication cannot restore it',async()=>{
 const verify=deferred();const f=fixture({auth:{getUser:()=>verify.promise}});const check=f.lifecycle.check();await tick();f.setSession(null);f.emit('SIGNED_OUT');
 assert.ok(f.events.some(x=>x[0]==='invalidate'));verify.resolve({data:{user:{id:'fixture-a'}}});await check;f.lifecycle.stop();assert.ok(!f.events.some(x=>x[0]==='session'));
});
test('identity switch clears old ownership before admitting new owner',async()=>{
 const f=fixture();await f.lifecycle.check();f.events.length=0;f.setSession({user:{id:'fixture-b'},expires_at:Date.now()/1000+3600});f.emit('SIGNED_IN');await tick();await tick();f.lifecycle.stop();
 assert.equal(f.events[0][0],'invalidate');assert.ok(f.events.findIndex(x=>x[0]==='cleanup')<f.events.findIndex(x=>x[0]==='session'));assert.ok(f.events.some(x=>x[0]==='session'&&x[1]==='fixture-b'));
});
test('old binding rejection cannot clear a newer verified identity',async()=>{
 const old=deferred();const f=fixture({bind:id=>id==='fixture-a'?old.promise:Promise.resolve()});const first=f.lifecycle.check();await tick();f.setSession({user:{id:'fixture-b'},expires_at:Date.now()/1000+3600});f.emit('SIGNED_IN');await tick();await tick();const before=f.events.length;old.reject(Error('late'));await first;await tick();f.lifecycle.stop();assert.ok(!f.events.slice(before).some(x=>x[0]==='invalidate'||x[0]==='cleanup'));
});
test('notification cleanup failure is surfaced without rejecting valid auth',async()=>{
 const f=fixture({bind:async(id)=>{if(id)throw Error('lost ack');},cleanup:async()=>({ok:false,errors:['unsubscribe-failed']})});await f.lifecycle.check();await tick();f.lifecycle.stop();assert.ok(f.events.some(x=>x[0]==='session'));assert.ok(f.events.some(x=>x[0]==='notification-error'));
});
