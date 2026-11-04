'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

async function waitFor(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

test('portal exposes authenticated Echo queue API instead of SPA fallback', async (t) => {
  const port = 18080 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['scripts/portal-server.cjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SUPABASE_INTERNAL_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-only', SUPABASE_ANON_KEY: 'fixture-anon-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));

  await waitFor(`http://127.0.0.1:${port}/healthz`);
  const response = await fetch(`http://127.0.0.1:${port}/api/echo/jobs`);
  const contentType = response.headers.get('content-type') || '';
  const payload = await response.json().catch(() => null);

  assert.equal(response.status, 401);
  assert.match(contentType, /^application\/json/);
  assert.deepEqual(payload, { error: 'login required' });

  const inboxResponse = await fetch(`http://127.0.0.1:${port}/api/business-inbox`);
  const inboxPayload = await inboxResponse.json().catch(() => null);
  assert.equal(inboxResponse.status, 401);
  assert.deepEqual(inboxPayload, { error: 'login required' });
});
