import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const pngSize = (relativePath: string) => {
  const data = readFileSync(resolve(root, relativePath));
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
};

test('desktop favicon and mobile install icons use square Bright Forge assets', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="icon" type="image\/png" href="\.\/assets\/icon\.png"\s*\/?>/);

  for (const asset of [
    'assets/icon.png',
    'assets/icon-192.png',
    'assets/icon-maskable-192.png',
    'assets/icon-maskable-512.png',
  ]) {
    const size = pngSize(asset);
    assert.equal(size.width, size.height, `${asset} must be square`);
  }
});
