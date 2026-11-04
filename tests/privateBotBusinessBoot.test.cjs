'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
test('business Python transport participates in boot digest',()=>{const state=require('../scripts/private-bot-build.cjs').initialise();assert.ok(state.modules['scripts/private-bot-business-google.py']);});
