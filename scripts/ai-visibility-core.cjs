'use strict';
const {createHash}=require('node:crypto');
const ENGINES=['chatgpt','gemini','perplexity'];
function invalid(message){throw Object.assign(Error(message),{status:400});}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.trim().length>max)invalid(`Invalid ${label}`);return value.trim();}
function list(value,max,len){if(!Array.isArray(value)||value.length>max)invalid('Invalid list');return [...new Set(value.map(v=>text(v,len,'list item')))];}
function validateProject(input){
 const name=text(input.name,120,'client name');let url;try{url=new URL(/^https?:\/\//.test(input.domain)?input.domain:`https://${input.domain}`);}catch{invalid('Invalid website');}
 const domain=url.hostname.toLowerCase().replace(/^www\./,'');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||!domain.includes('.')||/^[\d.:]+$/.test(domain)||domain.endsWith('.local')||domain.endsWith('.localhost')||domain.includes(':')||!/^[a-z0-9.-]+$/.test(domain))invalid('Use a public website domain');
 const engines=list(input.engines||ENGINES,3,20);if(!engines.length||engines.some(e=>!ENGINES.includes(e)))invalid('Invalid engines');
 const repetitions=input.repetitions??1;if(!Number.isInteger(repetitions)||repetitions<1||repetitions>3)invalid('Repetitions must be 1 to 3');
 return {name,domain,agency:text(input.agency||'Frog Online',100,'agency'),aliases:list(input.aliases||[name],20,120),competitors:list(input.competitors||[],20,120),market:text(input.market||'Australia',100,'market'),language:text(input.language||'English',50,'language'),engines,repetitions};
}
function validatePrompts(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>50)invalid('Use 1 to 50 prompts');
 const out=rows.map(p=>({text:text(p.text,1500,'prompt'),category:text(p.category||'general',80,'category')}));
 if(new Set(out.map(p=>p.text.toLowerCase())).size!==out.length)invalid('Duplicate prompts');return out;
}
function fingerprint(value){const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');}
function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function validateObservation(o){
 const answer=text(o.answer,60000,'answer'),model=text(o.model,120,'observed model');const source_url=safeUrl(o.source_url);if(!source_url)invalid('Evidence URL required');
 const date=Date.parse(o.observed_at);if(!Number.isFinite(date)||date>Date.now()+60000)invalid('Valid past observation time required');
 if(![null,undefined,'yes','no','unclear'].includes(o.recommendation))invalid('Invalid recommendation label');
 if(!Array.isArray(o.citations)||o.citations.length>100||o.citations.some(u=>!safeUrl(u)))invalid('Invalid citations');
 return {answer,model,source_url,observed_at:new Date(date).toISOString(),citations:[...new Set(o.citations.map(safeUrl))],recommendation:o.recommendation??null};
}
function hasName(answer,name){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'iu').test(answer);}
function analyse(project,observation){
 const answer=observation.answer||'';const citations=observation.citations||[];
 return {mentioned:[project.name,...(project.aliases||[])].some(n=>hasName(answer,n)),cited:citations.some(u=>{try{const h=new URL(u).hostname.replace(/^www\./,'');return h===project.domain||h.endsWith('.'+project.domain);}catch{return false;}}),competitors:(project.competitors||[]).filter(n=>hasName(answer,n)),recommendation:observation.recommendation??null};
}
function summary(samples){const complete=samples.filter(s=>s.status==='complete');const reviewed=complete.filter(s=>['yes','no'].includes(s.recommendation));const rate=(a,b)=>b?Math.round(a/b*1000)/10:null;
 return {planned:samples.length,completed:complete.length,failed:samples.filter(s=>s.status==='failed').length,pending:samples.filter(s=>['pending','running'].includes(s.status)).length,mention_rate:rate(complete.filter(s=>s.mentioned).length,complete.length),citation_rate:rate(complete.filter(s=>s.cited).length,complete.length),recommendation_rate:rate(reviewed.filter(s=>s.recommendation==='yes').length,reviewed.length),recommendations_reviewed:reviewed.length};
}
module.exports={ENGINES,invalid,text,list,validateProject,validatePrompts,fingerprint,safeUrl,validateObservation,analyse,summary};
