'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('default npm test command includes TypeScript, CommonJS and ESM regression tests', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  const command = pkg.scripts?.test || '';
  assert.match(command, /tests\/\*\.test\.ts/);
  assert.match(command, /tests\/\*\.test\.cjs/);
  assert.match(command, /tests\/\*\.test\.mjs/);
});
