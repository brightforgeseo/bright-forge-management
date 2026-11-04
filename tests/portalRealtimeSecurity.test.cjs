'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const http=require('node:http'), net=require('node:net'), path=require('node:path');
const {spawn}=require('node:child_process');
const {WebSocket,WebSocketServer}=require('ws');
const {publicProxyAllowed,realtimeMessage}=require('../scripts/portal-proxy-policy.cjs');
const jwt=role=>'e30.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.synthetic';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const listen=s=>new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve(s.address().port)));
const closed=s=>new Promise(resolve=>s.once('close',(code)=>resolve(code)));
const opened=s=>new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject);});
const received=s=>new Promise((resolve,reject)=>{s.once('message',d=>resolve(JSON.parse(d.toString())));s.once('error',reject);});
const msg=(event,role='authenticated',array=false)=>array?['1','1','realtime:fixture',event,{access_token:jwt(role),config:{}}]:{topic:'realtime:fixture',event,payload:{access_token:jwt(role),config:{}},ref:'1'};
// Execute the installed SDK serializer, rather than inventing a binary layout.
function sdkBroadcast(payload) {
  const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
  const file=path.resolve(__dirname,'../node_modules/@supabase/realtime-js/src/lib/serializer.ts');
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:()=>({CHANNEL_EVENTS:{}}),ArrayBuffer,Uint8Array,DataView,TextEncoder,TextDecoder});
  let bytes; new module.exports.default().encode({join_ref:'1',ref:'2',topic:'realtime:call:fixture',event:'broadcast',payload:{event:'signal',payload}},x=>{bytes=Buffer.from(x);});
  return bytes;
}
test('all supported singleton carriers reject duplicates, coalescing, arrays and privileged claims',()=>{
  for(const key of ['authorization','apikey','access_token','x-api-key','token']) {
    const url='/supabase/realtime/v1/websocket'; const a=jwt('anon'), p=jwt('supabase_admin');
    for (const value of [p,'Bearer '+p,a+', '+p,[a,p]]) assert.equal(publicProxyAllowed({url,headers:{[key]:value}}),false);
    assert.equal(publicProxyAllowed({url,headers:{[key]:a},rawHeaders:[key,a,key.toUpperCase(),a]}),false);
    assert.equal(publicProxyAllowed({url:url+'?'+key+'='+a+'&'+key.toUpperCase()+'='+a,headers:{}}),false);
    assert.equal(publicProxyAllowed({url:url+'?'+key+'='+a+'&'+key+'='+p,headers:{}}),false);
  }
  for(const role of ['anon','authenticated']) assert.equal(publicProxyAllowed({url:'/supabase/rest/v1/profiles',headers:{authorization:'Bearer '+jwt(role)}}),true);
  assert.equal(publicProxyAllowed({url:'/supabase/auth/v1/foo/..%2fadmin/users',headers:{}}),false);
});
test('JSON canonicalisation removes parser ambiguity; malformed/binary/deep credentials fail closed',()=>{
  for (const role of ['service_role','supabase_admin']) for(const array of [false,true]) for(const event of ['phx_join','access_token']) assert.equal(realtimeMessage(Buffer.from(JSON.stringify(msg(event,role,array))),false),null);
  for (const data of ['not json','[]','null','{}']) assert.equal(realtimeMessage(Buffer.from(data),false),null);
  assert.equal(realtimeMessage(Buffer.from(JSON.stringify(msg('phx_join'))),true),null);
  const duplicate='{"topic":"realtime:fixture","event":"phx_join","payload":{"access_token":"'+jwt('service_role')+'","access_token":"'+jwt('anon')+'"},"ref":"1"}';
  assert.equal(realtimeMessage(Buffer.from(duplicate),false).includes(jwt('service_role')),false);
});
test('real Portal sockets: negative carriers/join/refresh never reach upstream; legitimate lifecycle works',{timeout:20000},async t=>{
  const frames=[], requests=[], peers=new Set();
  const upstream=http.createServer((req,res)=>{requests.push(req.url);res.end('[]');});
  const wss=new WebSocketServer({server:upstream,perMessageDeflate:false});
  wss.on('connection',s=>{peers.add(s);s.on('close',()=>peers.delete(s));s.on('message',(data,binary)=>{frames.push({text:data.toString(),binary});s.send(data,{binary:false});});});
  const upstreamPort=await listen(upstream), reserve=net.createServer(), port=await listen(reserve);await new Promise(r=>reserve.close(r));
  const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/portal-server.cjs')],{env:{PRIVATE_BOT_WORKER_DISABLED:'1',PATH:process.env.PATH,PORT:String(port),SUPABASE_INTERNAL_URL:'http://127.0.0.1:'+upstreamPort,SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  const clients=[];
  t.after(async()=>{for(const c of clients)c.terminate();for(const s of peers)s.terminate();child.kill('SIGTERM');wss.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));});
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:'+port+'/healthz')).ok;if(ready)break;}catch{}await pause(20);}assert.equal(ready,true,'isolated server readiness');
  const base='ws://127.0.0.1:'+port+'/supabase/realtime/v1/websocket?apikey='+jwt('anon');
  const connect=async(vsn='1.0.0')=>{const c=new WebSocket(base+'&vsn='+vsn);clients.push(c);await opened(c);return c;};
  await t.test('HTTP raw duplicate Authorization/apikey cannot hide behind Node header normalisation',async()=>{
    for(const key of ['Authorization','apikey','access_token','x-api-key','token']) {
      const status=await new Promise((resolve,reject)=>{let data='';const s=net.connect(port,'127.0.0.1',()=>s.write('GET /supabase/rest/v1/profiles HTTP/1.1\r\nHost: localhost\r\n'+key+': '+jwt('anon')+'\r\n'+key+': '+jwt('service_role')+'\r\nConnection: close\r\n\r\n'));s.on('error',reject);s.on('data',d=>data+=d);s.on('end',()=>resolve(data.split('\r\n')[0]));});
      assert.match(status,/403/);
    }
    assert.equal(requests.length,0);
  });
  await t.test('duplicate/privileged handshake query denied',async()=>{
    for(const suffix of ['&apikey='+jwt('anon'),'&access_token='+jwt('service_role'),'&access_token='+jwt('anon')+'&access_token='+jwt('anon')]) {
      const c=new WebSocket(base+suffix);clients.push(c);const status=await new Promise(resolve=>{c.on('unexpected-response',(_,res)=>{res.resume();resolve(res.statusCode);});c.on('error',()=>{});});assert.equal(status,403);c.terminate();
    }
  });
  await t.test('service_role and supabase_admin join/refresh object and tuple denied before upstream handling',async()=>{
    for(const array of [false,true]) for(const event of ['phx_join','access_token']) for(const role of ['service_role','supabase_admin']) {
      const c=await connect(array?'2.0.0':'1.0.0'),before=frames.length,close=closed(c);c.send(JSON.stringify(msg(event,role,array)));assert.equal(await close,1008);assert.equal(frames.length,before);
    }
  });
  await t.test('fragmented credential frame, binary and oversized frame are bounded and denied',async()=>{
    let c=await connect(),before=frames.length,close=closed(c);let text=JSON.stringify(msg('phx_join','service_role'));c.send(text.slice(0,25),{fin:false});c.send(text.slice(25),{fin:true});assert.equal(await close,1008);assert.equal(frames.length,before);
    c=await connect();close=closed(c);c.send(Buffer.from(JSON.stringify(msg('phx_join','service_role'))));assert.equal(await close,1008);assert.equal(frames.length,before);
    c=await connect();close=closed(c);c.send('x'.repeat(300*1024));assert.ok([1009,1011].includes(await close));assert.equal(frames.length,before);
  });
  await t.test('anon/authenticated joins, token refresh, reconnect, heartbeat and control ping/pong preserved',async()=>{
    for(const array of [false,true]) {
      const c=await connect(array?'2.0.0':'1.0.0');
      for(const [event,role] of [['phx_join','anon'],['phx_join','authenticated'],['access_token','authenticated']]) {const sent=msg(event,role,array),reply=received(c);c.send(JSON.stringify(sent));assert.deepEqual(await reply,sent);}
      const heartbeat=array?[null,'2','phoenix','heartbeat',{}]:{topic:'phoenix',event:'heartbeat',payload:{},ref:'2'};const reply=received(c);c.send(JSON.stringify(heartbeat));assert.deepEqual(await reply,heartbeat);
      const pong=new Promise(resolve=>c.once('pong',resolve));c.ping('fixture');assert.equal((await pong).toString(),'fixture');let done=closed(c);c.close();await done;
      const reconnected=await connect(array?'2.0.0':'1.0.0'),again=received(reconnected);reconnected.send(JSON.stringify(msg('phx_join','authenticated',array)));assert.deepEqual(await again,msg('phx_join','authenticated',array));done=closed(reconnected);reconnected.close();await done;
    }
  });
  await t.test('installed SDK binary signalling broadcasts retained, credential-bearing binary payloads blocked',async()=>{
    let c=await connect('2.0.0'),before=frames.length;
    const bytes=sdkBroadcast({type:'join',from:'synthetic',roomId:'synthetic'});
    const echo=new Promise(resolve=>c.once('message',resolve));c.send(bytes);assert.deepEqual(await echo,bytes);
    assert.equal(frames.length,before+1);assert.equal(frames.at(-1).binary,true);
    let done=closed(c);c.close();await done;
    c=await connect('2.0.0');before=frames.length;done=closed(c);c.send(sdkBroadcast({access_token:jwt('service_role')}));assert.equal(await done,1008);assert.equal(frames.length,before);
  });
  assert.equal(frames.some(x=>x.text.includes(jwt('service_role')) || x.text.includes(jwt('supabase_admin'))),false);
  assert.equal(logs.includes('access_token='),false);assert.equal(logs.includes(jwt('anon')),false);
});
