import test from 'node:test';
import assert from 'node:assert/strict';
import { createEchoQueueClient } from '../lib/echoQueueClient.ts';

test('Echo queue client authenticates, queues and polls to a response', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const replies = [
    new Response(JSON.stringify({ job: { id: '11111111-1111-4111-8111-111111111111', status: 'queued' } }), { status: 202, headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ jobs: [{ id: '11111111-1111-4111-8111-111111111111', status: 'running' }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ jobs: [{ id: '11111111-1111-4111-8111-111111111111', status: 'succeeded', result: { response: 'Queue reply' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  ];
  const client = createEchoQueueClient({
    baseUrl: 'https://portal.example',
    getAccessToken: async () => 'user-token',
    fetchFn: async (url, init) => {
      requests.push({ url: String(url), init });
      const response = replies.shift();
      if (!response) throw new Error('unexpected request');
      return response;
    },
    sleep: async () => {},
    timeoutMs: 1000,
  });

  const response = await client.run({ kind: 'chat', message: 'Hello' });

  assert.equal(response, 'Queue reply');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, 'https://portal.example/api/echo/jobs');
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal((requests[0].init?.headers as Record<string, string>).Authorization, 'Bearer user-token');
  assert.equal(requests[1].url, 'https://portal.example/api/echo/jobs?id=11111111-1111-4111-8111-111111111111');
});

test('Echo queue client reports failed jobs without silent fallback', async () => {
  const replies = [
    new Response(JSON.stringify({ job: { id: '22222222-2222-4222-8222-222222222222' } }), { status: 202 }),
    new Response(JSON.stringify({ jobs: [{ status: 'failed', error_message: 'worker failed' }] }), { status: 200 }),
  ];
  const client = createEchoQueueClient({
    baseUrl: '',
    getAccessToken: async () => 'user-token',
    fetchFn: async () => replies.shift()!,
    sleep: async () => {},
    timeoutMs: 1000,
  });

  await assert.rejects(() => client.run({ kind: 'chat', message: 'Hello' }), /worker failed/);
});
