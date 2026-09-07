const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
test('Settings uses authenticated server API instead of anonymous admin client',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../services/databaseService.ts'),'utf8');
 assert.ok(!source.includes('supabaseAdmin.auth.admin'));
 assert.ok(source.includes('/api/admin/users'));
 assert.ok(source.includes('session.access_token'));
 assert.ok(source.includes('hasMore'));
 const server=fs.readFileSync(require('node:path').join(__dirname,'../scripts/portal-server.cjs'),'utf8');
 assert.ok(server.includes('handleUserManagement(req, res)'));
});
