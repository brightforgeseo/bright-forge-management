const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('app logout removes push before revoking the authenticated session',async()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../App.tsx'),'utf8');
  const body=source.match(/const handleLogout = async \(\) => \{([\s\S]*?)\n  \};/)[1];
  const calls=[];
  await vm.runInNewContext('(async()=>{'+body+'})()',{
    disableWebPush:async()=>calls.push('unsubscribe'),
    supabase:{auth:{signOut:async()=>calls.push('signOut')}},
    setIsAuthenticated:()=>{},localStorage:{removeItem:()=>{}},
    window:{electronAPI:{clearNotifications:()=>calls.push('clearNative')}},
  });
  assert.deepEqual(calls,['clearNative','unsubscribe','signOut']);
});
