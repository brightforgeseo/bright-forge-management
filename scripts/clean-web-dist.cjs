#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PRESERVED_DESKTOP_DIRS = new Set(['win-unpacked', 'linux-unpacked']);

function cleanWebDist(distPath) {
  fs.mkdirSync(distPath, { recursive: true });
  for (const entry of fs.readdirSync(distPath)) {
    if (PRESERVED_DESKTOP_DIRS.has(entry)) continue;
    fs.rmSync(path.join(distPath, entry), { recursive: true, force: true });
  }
}

if (require.main === module) {
  cleanWebDist(path.resolve(__dirname, '..', 'dist'));
}

module.exports = { cleanWebDist, PRESERVED_DESKTOP_DIRS };
