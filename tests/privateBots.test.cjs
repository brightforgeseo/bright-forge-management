'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs'); const path = require('node:path');
test('Portal serves private bot API before SPA fallback without reusing cached legacy authentication', () => {
  const source = fs.readFileSync(path.join(__dirname,'../scripts/portal-server.cjs'),'utf8');
  assert.ok(source.includes('createPrivateBotAuthenticator'), 'fresh private authentication is not mounted');
  assert.ok(source.includes('handlePrivateBots(req, res)'), 'private API is not mounted');
});
// The existing API must expose an owner-filtered private-bot workflow, not UI-only hiding.
test('private bot read and mutation never resolve another owner bot', async () => {
  let createPrivateBotsHandler;
  try { ({ createPrivateBotsHandler } = require('../scripts/portal-private-bots.cjs')); } catch {}
  assert.equal(typeof createPrivateBotsHandler, 'function', 'private-bot ownership boundary is missing');
  const calls = [];
  const handler = createPrivateBotsHandler({
    authenticate: async () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    api: async (path, method, body) => { calls.push({ path, method, body }); return []; },
  });
  const server = http.createServer(handler); await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/private-bots`;
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    for (const [method, suffix, body] of [
      ['GET', `/${id}`, null], ['PATCH', `/${id}`, { name: 'Forged' }],
      ['POST', `/${id}/jobs`, { message: 'Forbidden' }], ['GET', `/${id}/jobs`, null],
    ]) {
      const res = await fetch(base + suffix, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      assert.equal(res.status, 404, `${method} ${suffix}`);
    }
    assert.ok(calls.every(c => c.path.includes('owner_id=eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')));
    assert.ok(calls.every(c => !c.method || c.method === 'GET'), 'no mutation before ownership is established');
  } finally { await new Promise(r => server.close(r)); }
});
