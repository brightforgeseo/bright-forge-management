'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT_FILES = [
  'components/EchoWorkspaces.tsx',
  'components/TeamChat.tsx',
  'services/geminiService.ts',
  'services/littleEchoService.ts',
  'services/businessInboxService.ts',
  'lib/bridgeClient.ts',
];

test('browser bundle sources contain no shared Echo bridge secret', () => {
  for (const relative of CLIENT_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.equal(source.includes('brightforge-echo-bridge-2026'), false, `${relative} embeds shared bridge secret`);
    assert.equal(source.includes("['brightforge', 'echo', 'bridge', '2026']"), false, `${relative} reconstructs shared bridge secret`);
  }
});

test('Echo workspace does not advertise retired model labels', () => {
  const source = fs.readFileSync(path.join(ROOT, 'components/EchoWorkspaces.tsx'), 'utf8');
  assert.equal(source.includes('ChatGPT 5.5'), false);
});
