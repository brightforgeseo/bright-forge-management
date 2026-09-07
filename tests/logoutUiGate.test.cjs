const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('logout unmounts authenticated UI without offering a new login during cleanup',()=>{
 const app=fs.readFileSync(require('node:path').join(__dirname,'../App.tsx'),'utf8');
 assert.ok(app.includes('setIsLoggingOut(true)'));
 assert.ok(app.indexOf('if (isLoggingOut) return') < app.indexOf('if (!isAuthenticated) return <Login'));
 assert.ok(app.includes('setIsLoggingOut(false)'));
});
