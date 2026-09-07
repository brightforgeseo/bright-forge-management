import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Business Inbox has an outer scrolling path below the desktop breakpoint',()=>{
 const source=readFileSync(new URL('../components/BusinessInbox.tsx',import.meta.url),'utf8');
 assert.match(source,/h-full overflow-y-auto lg:overflow-visible p-4/);
 assert.match(source,/h-auto lg:h-\[calc\(100vh-190px\)\]/);
});
