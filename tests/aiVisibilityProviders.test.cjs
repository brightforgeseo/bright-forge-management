'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
test('unconfigured engines fail closed without any outbound request',async()=>{
 const {collect,connections}=require('../scripts/ai-visibility-providers.cjs');
 let called=0;await assert.rejects(()=>collect('gemini','Question?',{}, {env:{},fetch:async()=>{called++;}}),/PROVIDER_NOT_CONFIGURED/);assert.equal(called,0);assert.equal(connections({}).filter(p=>p.ready).length,0);
});
test('OpenAI collection uses web search, excludes target-brand priming, captures citations and actual model',async()=>{
 const {collect}=require('../scripts/ai-visibility-providers.cjs');let body;
 const r=await collect('chatgpt','Which plumbers work in Perth?',{market:'Australia',language:'English',name:'SECRET TARGET'}, {env:{AI_VISIBILITY_OPENAI_API_KEY:'test-only'},fetch:async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');body=JSON.parse(opts.body);return {ok:true,json:async()=>({id:'resp-test',model:'actual-model',output:[{type:'message',content:[{type:'output_text',text:'A real response',annotations:[{type:'url_citation',url:'https://example.com'}]}]}]})};}});
 assert.equal(body.tools[0].type,'web_search');assert.ok(!JSON.stringify(body).includes('SECRET TARGET'));assert.equal(r.answer,'A real response');assert.equal(r.model,'actual-model');assert.deepEqual(r.citations,['https://example.com/']);
});
test('provider failure is sanitised and does not echo credentials or provider body',async()=>{
 const {collect}=require('../scripts/ai-visibility-providers.cjs');await assert.rejects(()=>collect('perplexity','Question?',{}, {env:{AI_VISIBILITY_PERPLEXITY_API_KEY:'secret'},fetch:async()=>({ok:false,status:401,json:async()=>({secret:'leak'})})}),/^Error: PROVIDER_HTTP_401$/);
});
