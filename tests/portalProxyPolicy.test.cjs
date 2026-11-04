const test=require('node:test');const assert=require('node:assert/strict');
const {publicProxyAllowed}=require('../scripts/portal-proxy-policy.cjs');
const jwt=role=>'e30.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.fixture';
const req=(url,headers={})=>({url,headers});
test('public proxy denies service headers and realtime query credentials',()=>{
 for(const k of ['authorization','apikey'])assert.equal(publicProxyAllowed(req('/supabase/rest/v1/profiles',{[k]:jwt('service_role')})),false);
 assert.equal(publicProxyAllowed(req('/supabase/realtime/v1/websocket?apikey='+jwt('service_role'))),false);
 assert.equal(publicProxyAllowed(req('/supabase/realtime/v1/websocket?access_token='+jwt('service_role'))),false);
 assert.equal(publicProxyAllowed(req('/supabase/rest/v1/profiles',{apikey:'sb_secret_fixture'})),false);
});
test('public proxy permits anon/authenticated traffic but blocks encoded admin routes',()=>{
 for(const role of ['anon','authenticated'])assert.equal(publicProxyAllowed(req('/supabase/rest/v1/profiles',{authorization:'Bearer '+jwt(role)})),true);
 for(const path of ['/supabase/auth/v1/admin/users','/supabase/auth/v1/%61dmin/users','/supabase/auth//v1/admin/users'])assert.equal(publicProxyAllowed(req(path)),false);
 assert.equal(publicProxyAllowed(req('/supabase/auth/v1/token?grant_type=password')),true);
});
