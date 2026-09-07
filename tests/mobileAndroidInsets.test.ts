import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Android native content respects keyboard and system-bar insets',()=>{
 const java=readFileSync(new URL('../android/app/src/main/java/com/brightforge/portal/MainActivity.java',import.meta.url),'utf8');
 assert.match(java,/setOnApplyWindowInsetsListener/);
 assert.match(java,/Type\.ime\(\)/);
 assert.match(java,/Math\.max\(bars\.bottom, ime\.bottom\)/);
});
