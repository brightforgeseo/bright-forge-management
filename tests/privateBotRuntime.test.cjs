'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
test('authentication checks verified subject, live ban and exact participant binding without cache', async () => {
  let createPrivateBotAuthenticator;
  try { ({createPrivateBotAuthenticator} = require('../scripts/private-bot-runtime.cjs')); } catch {}
  assert.equal(typeof createPrivateBotAuthenticator,'function','fresh private-bot authentication missing');
  let banned = false; let validated = 0;
  const auth = createPrivateBotAuthenticator({
    validate: async token => {validated++; return token==='valid' ? {id:'owner'} : null;},
    api: async path => path.startsWith('/auth/') ? {id:'owner',email:'test@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',banned_until:banned?'2099-01-01':null} : [{owner_id:'owner',email:'test@example.invalid'}],
  });
  assert.equal(await auth({headers:{host:'portal'}}),null);
  assert.equal(await auth({headers:{host:'portal',authorization:'Bearer expired'}}),null);
  const req={headers:{host:'portal',authorization:'Bearer valid'}};
  assert.equal((await auth(req)).id,'owner'); banned=true;
  assert.equal(await auth(req),null,'a previous valid token must not bypass current ban');
  assert.equal(validated,3);
  assert.equal(await auth({headers:{...req.headers,origin:'https://evil.invalid'}}),null);
});
test('worker uses database-coordinated leases and never fails another live worker at startup', async () => {
  const { createPrivateBotWorker } = require('../scripts/private-bot-runtime.cjs');
  const calls = [];
  const worker = createPrivateBotWorker({ api: async (path, method, payload) => { calls.push({path, method, payload}); return []; } });
  const stop = await worker.start(); stop();
  assert.ok(calls.some(c=>c.path==='/rest/v1/rpc/claim_private_bot_job'), 'global database claim missing');
  assert.ok(!calls.some(c=>c.method==='PATCH' && c.path.includes('status=eq.running')), 'must not reset other workers live jobs');
});
test('model transcript is only one owned bot, bounded and has no tools or global memory', () => {
  let modelMessages;
  try { ({modelMessages} = require('../scripts/private-bot-runtime.cjs')); } catch {}
  assert.equal(typeof modelMessages,'function','bounded model context missing');
  const job={id:'job1',bot_id:'bot1',owner_id:'owner1',message:'current',instructions:'Be concise',context:'private context'};
  const history=[{id:'other',bot_id:'bot2',owner_id:'owner2',status:'completed',message:'SECRET OTHER',response:'SECRET'}, {id:'old',bot_id:'bot1',owner_id:'owner1',status:'completed',message:'old request',response:'own answer'}];
  const messages=modelMessages(job,history);
  const all=JSON.stringify(messages);
  assert.ok(all.includes('own answer')); assert.ok(all.includes('private context'));
  assert.ok(!all.includes('SECRET')); assert.equal(messages.at(-1).content,'current');
  assert.ok(messages[0].content.includes('No arbitrary terminal'));
  assert.equal(messages.filter(m=>m.role==='system').length,1);
  assert.ok(messages[1].role==='user','customisation remains untrusted, not system policy');
});
