import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Android live loader uses the verified current shared portal origin',()=>{
 const config=readFileSync(new URL('../capacitor.config.ts',import.meta.url),'utf8');
 assert.match(config,/url: 'https:\/\/echo-ben\.tailfdbc33\.ts\.net'/);
 assert.doesNotMatch(config,/echo-ai\.tailfdbc33\.ts\.net/);
});
