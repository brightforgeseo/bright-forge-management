const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../scripts/user-management-api.cjs');
const owner = 'aaaaaaaa-1111-4111-8111-111111111111';
async function fixture(t) {
  assert.ok(fs.existsSync(modulePath), 'owner-authorised API must exist');
  const {createUserManagementHandler} = require(modulePath);
  const calls=[];
  const upstream=http.createServer((req,res)=>{
    calls.push({url:req.url,auth:req.headers.authorization,method:req.method});
    res.setHeader('content-type','application/json');
    if(req.url==='/auth/v1/user') {
      if(req.headers.authorization==='Bearer revoked') {res.statusCode=401;return res.end('{}');}
      return res.end(JSON.stringify({id:req.headers.authorization==='Bearer owner'?owner:'22222222-2222-4222-8222-222222222222',email:'fixture@example.invalid',user_metadata:{role:'Owner'}}));
    }
    if(req.url==='/auth/v1/admin/users/33333333-3333-4333-8333-333333333333') return res.end(JSON.stringify({id:'33333333-3333-4333-8333-333333333333'}));
    if(req.url.startsWith('/auth/v1/admin/users')) return res.end(JSON.stringify({users:[{id:owner,email:'fixture@example.invalid',created_at:'2026-01-01',user_metadata:{full_name:'Fixture',secret:'omit'},app_metadata:{secret:'omit'}}]}));
    res.statusCode=404;res.end('{}');
  });
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const handle=createUserManagementHandler({supabaseUrl:`http://127.0.0.1:${upstream.address().port}`,anonKey:'public-fixture',serviceKey:'private-fixture',ownerIds:[owner]});
  const server=http.createServer(handle);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.close();upstream.close();});
  const request=(token,route='',options={})=>fetch(`http://127.0.0.1:${server.address().port}/api/admin/users${route}`,{...options,headers:{...(token?{authorization:`Bearer ${token}`} : {}),...options.headers}});
  return {request,calls};
}
test('desktop file origins can preflight without enabling cookie-based access',async t=>{
 const {request}=await fixture(t);
 const result=await request(null,'',{method:'OPTIONS',headers:{origin:'null','access-control-request-method':'GET','access-control-request-headers':'authorization'}});
 assert.equal(result.status,204);assert.equal(result.headers.get('access-control-allow-origin'),'null');
 assert.equal(result.headers.get('access-control-allow-credentials'),null);
 const directory=await request('owner','',{headers:{origin:'null'}});
 assert.equal(directory.headers.get('access-control-allow-origin'),'null');
});
test('protected owner UUID cannot be reset or deleted through case aliases',async t=>{const {request}=await fixture(t);assert.equal((await request('owner','/'+owner.toUpperCase(),{method:'DELETE'})).status,409);});
module.exports={fixture};
test('only remotely verified configured owners can list real paginated auth users',async t=>{
 const {request,calls}=await fixture(t);
 assert.equal((await request()).status,401);
 assert.equal((await request('revoked')).status,401);
 assert.equal((await request('member')).status,403);
 assert.equal(calls.filter(x=>x.url.includes('/admin/')).length,0);
 const result=await request('owner','?page=2&perPage=25');assert.equal(result.status,200);
 assert.equal(result.headers.get('cache-control'),'no-store');
 const body=await result.json();assert.equal(body.users[0].email,'fixture@example.invalid');
 assert.deepEqual(body.users[0].user_metadata,{full_name:'Fixture'});
 assert.equal(body.users[0].app_metadata,undefined);
 assert.ok(calls.some(x=>x.url==='/auth/v1/admin/users?page=2&per_page=25' && x.auth==='Bearer private-fixture'));
 assert.equal((await request('owner','?page=0')).status,400);
});
