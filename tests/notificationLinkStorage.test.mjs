import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=new URL('../lib/notificationLinkStorage.mjs',import.meta.url);
test('pending destinations are tab-local, account-scoped, and legacy data is discarded',async()=>{
 assert.ok(fs.existsSync(url));
 const m=new Map(); const storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
 globalThis.sessionStorage=storage;globalThis.localStorage=storage;
 m.set('openTaskModal','legacy');
 const {notificationLinkStorage:s,setNotificationLinkUser:setUser}=await import(url);
 setUser('alice');assert.equal(m.has('openTaskModal'),false);
 s.setItem('openTaskModal','alice-task');setUser('bob');assert.equal(s.getItem('openTaskModal'),null);
 s.setItem('openTaskModal','bob-task');setUser(null);assert.equal(s.getItem('openTaskModal'),null);
 setUser('bob');assert.equal(s.getItem('openTaskModal'),null);
});
