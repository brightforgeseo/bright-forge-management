'use strict';
// Exact TypeScript modules, real Supabase SDK, fully synthetic transport. No DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sdk = require('@supabase/supabase-js');
const root = process.env.PORTAL_SOURCE_ROOT || path.resolve(__dirname, '..');
const id = '00000000-0000-4000-8000-000000000001';
const partner = '00000000-0000-4000-8000-000000000002';
const jwt = (role, version = 0) => 'e30.' + Buffer.from(JSON.stringify({role, sub:id, exp:Math.floor(Date.now()/1000)+3600, version})).toString('base64url') + '.fixture';
function harness() {
  let current = jwt('authenticated'), deny = false;
  const anon = jwt('anon'), calls = [];
  const user = { id, email:'fixture@example.invalid', role:'authenticated', aud:'authenticated', app_metadata:{}, user_metadata:{full_name:'Owner'}, created_at:'2026-01-01' };
  const transport = async (input, opts = {}) => {
    const url = new URL(input), headers = new Headers(opts.headers);
    const auth = headers.get('authorization');
    if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'refresh_token') current = jwt('authenticated', 1);
      return Response.json({access_token:current, refresh_token:'fixture-refresh', expires_in:3600, token_type:'bearer', user});
    }
    if (url.pathname.endsWith('/user')) return auth === 'Bearer '+current ? Response.json(user) : Response.json({message:'denied'}, {status:401});
    if (url.pathname.endsWith('/logout')) return new Response(null, {status:204});
    assert.ok(url.pathname.startsWith('/rest/v1/'), 'No unexpected privileged/external route');
    const call = {url, method:opts.method || 'GET', auth, body:opts.body ? JSON.parse(opts.body) : null}; calls.push(call);
    if (deny || auth !== 'Bearer '+current) return Response.json({message:'synthetic RLS denied'}, {status:403});
    if (opts.method === 'HEAD') return new Response(null, {status:200, headers:{'content-range':'0-0/1'}});
    const table = url.pathname.split('/').pop();
    let data = [];
    if (table === 'partner_accounts') data = [{id:partner, company_name:'Synthetic partner', full_name:'Fixture'}];
    if (table === 'partner_messages') data = opts.method === 'POST' ? {id:'synthetic-message',...call.body} : (url.searchParams.get('select') === 'created_at' ? [] : [{id:'synthetic-message',partner_id:partner}]);
    if (table === 'client_boards') data = [{id:'row',board_data:{id:'board',groups:[{id:'group',tasks:[{id:'task',comments:[]}]}]}}];
    return Response.json(data);
  };
  const cache = new Map();
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const module = {exports:{}}; cache.set(rel,module.exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root,rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const req = name => {
      if (name === '@supabase/supabase-js') return {createClient:(url,key,opts={})=>sdk.createClient(url,key,{...opts,global:{fetch:transport},auth:{...opts.auth,autoRefreshToken:false,persistSession:false}})};
      if (name.endsWith('supabaseClient')) return load('lib/supabaseClient.ts');
      if (name.endsWith('supabaseAssetUrl')) return {resolveSupabaseAssetUrl:x=>x};
      if (name.endsWith('geminiService')) return {generateClientEmail:()=>{throw Error('No model calls');}};
      throw Error('Unexpected import '+name);
    };
    vm.runInNewContext(code,{module,exports:module.exports,require:req,process:{env:{SUPABASE_ANON_KEY:anon,SUPABASE_URL:'http://example.invalid'}},console,URL,Date,structuredClone,setTimeout,clearTimeout},{filename:rel});
    return module.exports;
  }
  const lib=load('lib/supabaseClient.ts'), service=load('services/clientPortalService.ts'), db=load('services/databaseService.ts');
  return {lib,service,db,calls,user,deny:()=>{deny=true;},token:()=>current,login:()=>lib.supabase.auth.signInWithPassword({email:user.email,password:'synthetic-only'})};
}
test('normal login, refresh and logout share one client with no secondary anonymous session',async()=>{
  const h=harness(); assert.equal((await h.login()).error,null);
  assert.equal(h.lib.supabaseAdmin,h.lib.supabase);
  await h.service.fetchPartnerMessages(partner);
  assert.equal(h.calls.at(-1).auth,'Bearer '+h.token());
  assert.equal((await h.lib.supabase.auth.refreshSession()).error,null);
  await h.service.fetchPartnerMessages(partner);
  assert.equal(h.calls.at(-1).auth,'Bearer '+h.token());
  await h.lib.supabase.auth.signOut();
  const count=h.calls.length; await assert.rejects(h.service.fetchPartnerMessages(partner),/sign in/i); assert.equal(h.calls.length,count);
});
test('retained partner reads, stats and synthetic actions carry user credentials and exact scope',async()=>{
  const h=harness(); await h.login();
  await h.service.grantClientAccess(partner,'board',id); await h.service.revokeClientAccess(partner,'board');
  await h.service.assignTaskToPartner(partner,'board','task','group'); await h.service.unassignTaskFromPartner(partner,'task');
  assert.equal(await h.service.addCommentToTask('board','group','task',{id:'comment',text:'Synthetic, never sent'}),true);
  await h.service.fetchPartnerMessages(partner);
  await h.service.sendPartnerMessage(partner,'Synthetic, never sent','team',id,'Fixture');
  await h.service.markPartnerMessagesRead(partner,'team'); await h.service.getUnreadMessageCount(partner,false);
  assert.equal((await h.service.fetchAllPartners()).length,1); await h.service.togglePartnerActive(partner,true);
  for (const c of h.calls) {
    assert.equal(c.auth,'Bearer '+h.token());
    const table=c.url.pathname.split('/').pop();
    if (['partner_messages','partner_client_access','partner_tasks'].includes(table)) assert.equal(c.body?.partner_id || c.url.searchParams.get('partner_id'),c.body?.partner_id ? partner : 'eq.'+partner);
    if (table==='client_boards') assert.equal(c.url.searchParams.get('board_data->>id'),'eq.board');
    if (table==='partner_accounts' && c.method==='PATCH') assert.equal(c.url.searchParams.get('id'),'eq.'+partner);
  }
});
test('spoofed sender/grantor, different partner identity and anonymous calls fail before table transport',async()=>{
  const h=harness(); await h.login();
  for (const promise of [h.service.sendPartnerMessage(partner,'not sent','team',partner,'Owner'),h.service.sendPartnerMessage(partner,'not sent','partner',id,'Owner'),h.service.grantClientAccess(partner,'board',partner),h.service.markPartnerMessagesRead(partner,'partner'),h.service.getUnreadMessageCount(partner,true)]) await assert.rejects(promise);
  assert.equal(h.calls.length,0);
});
test('upstream denial is not misrepresented as empty messages or zero unread/partner stats',async()=>{
  const h=harness(); await h.login(); h.deny();
  await assert.rejects(h.service.fetchPartnerMessages(partner));
  await assert.rejects(h.service.getUnreadMessageCount(partner,false));
  await assert.rejects(h.service.fetchAllPartners());
  await assert.rejects(h.service.sendPartnerMessage(partner,'not sent','team',id,'Fixture'));
});
test('pre-existing unsupported auth admin functions reject even display-name Owner, no admin or partial DB calls',async()=>{
  const h=harness(); await h.login();
  for (const promise of [h.db.fetchAllAuthUsers(),h.db.resetUserPassword(partner,'fixture-only'),h.db.deleteAuthUser(partner),h.service.createPartnerAccount('fixture@example.invalid','fixture-only','Fixture','Owner'),h.service.deletePartnerAccount(partner)]) await assert.rejects(promise,/verified server-side owner route/);
  assert.equal(h.calls.length,0);
});
test('visible login retires signup/anonymous activation and requires real password session',()=>{
  const source=fs.readFileSync(path.join(root,'components/Login.tsx'),'utf8');
  assert.doesNotMatch(source,/auth\.signUp|verifyPreProvisionedUser|checkAllowlist|setMode\('signup'\)/);
  assert.match(source,/!data\.user \|\| !data\.session/);
  assert.match(source,/Self-signup and temporary-password activation are not available/);
});
