'use strict';
const {safeUrl}=require('./ai-visibility-core.cjs');
const DEFINITIONS={
 chatgpt:{label:'ChatGPT / OpenAI API',key:'AI_VISIBILITY_OPENAI_API_KEY',modelKey:'AI_VISIBILITY_OPENAI_MODEL',model:'gpt-4.1'},
 gemini:{label:'Gemini API',key:'AI_VISIBILITY_GEMINI_API_KEY',modelKey:'AI_VISIBILITY_GEMINI_MODEL',model:'gemini-2.5-flash'},
 perplexity:{label:'Perplexity API',key:'AI_VISIBILITY_PERPLEXITY_API_KEY',modelKey:'AI_VISIBILITY_PERPLEXITY_MODEL',model:'sonar'},
};
function connections(env=process.env){return Object.entries(DEFINITIONS).map(([engine,p])=>({engine,label:p.label,ready:!!env[p.key],model:env[p.modelKey]||p.model,mode:'api'}));}
async function collect(engine,prompt,project,{env=process.env,fetch:fetcher=fetch}={}){
 const p=DEFINITIONS[engine];if(!p)throw Error('INVALID_ENGINE');if(!env[p.key])throw Error('PROVIDER_NOT_CONFIGURED');
 const model=env[p.modelKey]||p.model;let url,headers={'content-type':'application/json'},body;
 // Do not include target brand, domain or competitor list in measurement prompts.
 const instruction=`Answer in ${project.language||'English'}. The question concerns ${project.market||'Australia'}. Use current web sources when available. Do not invent sources.`;
 if(engine==='chatgpt'){
  url='https://api.openai.com/v1/responses';headers.authorization=`Bearer ${env[p.key]}`;
  body={model,instructions:instruction,input:prompt,tools:[{type:'web_search'}],max_output_tokens:3000,store:false};
 }else if(engine==='gemini'){
  url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;headers['x-goog-api-key']=env[p.key];
  body={systemInstruction:{parts:[{text:instruction}]},contents:[{role:'user',parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{maxOutputTokens:4000}};
 }else{
  url='https://api.perplexity.ai/chat/completions';headers.authorization=`Bearer ${env[p.key]}`;
  body={model,messages:[{role:'system',content:instruction},{role:'user',content:prompt}],max_tokens:3000};
 }
 let res;try{res=await fetcher(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(75000)});}catch{throw Error('PROVIDER_TRANSPORT_OR_TIMEOUT');}
 if(!res.ok)throw Error(`PROVIDER_HTTP_${res.status}`);
 let data;try{const raw=await res.json();data=raw;}catch{throw Error('PROVIDER_INVALID_RESPONSE');}
 let answer='',citations=[];
 if(engine==='chatgpt'){
  const content=(data.output||[]).filter(o=>o.type==='message').flatMap(o=>o.content||[]);answer=content.filter(c=>c.type==='output_text').map(c=>c.text).join('\n');citations=content.flatMap(c=>(c.annotations||[]).filter(a=>a.type==='url_citation').map(a=>a.url));
 }else if(engine==='gemini'){
  const c=data.candidates?.[0];answer=(c?.content?.parts||[]).map(p=>p.text||'').join('\n');citations=(c?.groundingMetadata?.groundingChunks||[]).map(c=>c.web?.uri).filter(Boolean);
 }else{answer=data.choices?.[0]?.message?.content||'';citations=data.citations||[];}
 if(typeof answer!=='string'||!answer.trim()||answer.length>60000)throw Error('PROVIDER_EMPTY_OR_OVERSIZED_RESPONSE');
 return {answer,model:data.model||data.modelVersion||model,citations:[...new Set(citations.map(safeUrl).filter(Boolean))].slice(0,100),provider_id:String(data.id||data.responseId||'').slice(0,200),observed_at:new Date().toISOString(),source_url:null,recommendation:null};
}
module.exports={DEFINITIONS,connections,collect};
