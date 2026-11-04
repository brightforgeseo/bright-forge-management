'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAgentToolBroker}=require('../scripts/private-bot-agent-tools.cjs');
const staff='942055eb-54f6-426a-8194-b81ab83669f6';
test('staff broker exposes native read and proposal but never model-callable commit',()=>{const b=createAgentToolBroker({api:async()=>[]}),names=b.schemas(staff).map(x=>x.function.name);assert.ok(names.includes('read_my_google_source'));assert.ok(names.includes('propose_my_google_edit'));assert.ok(!names.includes('approve_my_google_edit'));assert.equal(typeof b.approveGoogleEdit,'function');});
