'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
test('agent runtime exposes real tool protocol separately from one-shot text',()=>{
 let runAgentModel;try{({runAgentModel}=require('../scripts/private-bot-agent-runtime.cjs'));}catch{}
 assert.equal(typeof runAgentModel,'function','tool-calling agent runtime is missing');
});
