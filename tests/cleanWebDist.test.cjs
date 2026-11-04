'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanWebDist } = require('../scripts/clean-web-dist.cjs');

test('web build cleaner preserves packaged desktop directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-clean-dist-'));
  fs.writeFileSync(path.join(root, 'index.html'), 'old');
  fs.mkdirSync(path.join(root, 'win-unpacked'));
  fs.writeFileSync(path.join(root, 'win-unpacked', 'portal.exe'), 'binary');
  fs.mkdirSync(path.join(root, 'linux-unpacked'));
  fs.writeFileSync(path.join(root, 'linux-unpacked', 'portal'), 'binary');

  cleanWebDist(root);

  assert.equal(fs.existsSync(path.join(root, 'index.html')), false);
  assert.equal(fs.readFileSync(path.join(root, 'win-unpacked', 'portal.exe'), 'utf8'), 'binary');
  assert.equal(fs.readFileSync(path.join(root, 'linux-unpacked', 'portal'), 'utf8'), 'binary');
});
