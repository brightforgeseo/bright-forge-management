const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
test('live workspace route uses private owned API, persistent jobs and no legacy browser transcript',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
 const hub=fs.readFileSync(path.join(__dirname,'../components/EchoHub.tsx'),'utf8');
 assert.ok(app.includes("import('./components/EchoHub')")&&app.includes('default:m.EchoConversations')&&app.includes('<EchoDockConversations'),'Echo dock is not integrated');
 assert.ok(hub.includes("import('./PrivateBots')")&&hub.includes('<PrivateBots'),'private workspace UI is not integrated through the dock');
 const ui=fs.readFileSync(path.join(__dirname,'../components/PrivateBots.tsx'),'utf8');
 assert.ok(ui.includes('/api/private-bots'));
 assert.ok(ui.includes('retryJobId'));
 assert.ok(!ui.includes('localStorage'));
 assert.ok(!ui.includes('runEchoJob'));
 assert.ok(ui.includes('Personal assistant'));
 assert.ok(ui.includes('dataOwner !== currentUser.id'), 'render must clear old owner immediately');
 assert.ok(ui.includes('data.session.user.id !== expectedOwner'), 'request must bind session subject');
 assert.ok(ui.includes('setSending(false); setSaving(false)'), 'reset stuck flags on account switch');
});
