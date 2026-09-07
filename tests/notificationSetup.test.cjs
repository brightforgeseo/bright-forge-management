const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('sidebar exposes an explicit notification enable control',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../components/Sidebar.tsx'),'utf8');
 assert.match(source,/<NotificationSetup userId=\{currentUser.id\}/);
 assert.doesNotMatch(source,/enableWebPush\(currentUser.id\)/);
});
