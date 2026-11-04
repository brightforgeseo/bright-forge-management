'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
test('native Google code is in the startup digest before worker construction',()=>{
 require('../scripts/private-bot-runtime.cjs');
 const state=require('../scripts/private-bot-build.cjs').initialise();
 assert.equal(typeof state.modules['scripts/private-bot-google-native.cjs'],'string');
});
