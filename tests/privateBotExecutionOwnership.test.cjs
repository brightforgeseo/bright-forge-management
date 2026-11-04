const test=require('node:test'),assert=require('node:assert/strict');
const {modelMessages}=require('../scripts/private-bot-runtime.cjs');
test('selected private worker owns execution rather than treating assignment as delegation',()=>{
 const messages=modelMessages({id:'j',bot_id:'b',owner_id:'o',message:'find backlinks for consilium clinics'},[]);
 assert.match(messages[0].content,/already the selected private bot/);
 assert.match(messages[0].content,/public search before asking/);
 assert.match(messages[0].content,/No arbitrary terminal/);
});
