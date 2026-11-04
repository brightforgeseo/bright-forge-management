'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const core=()=>require('../scripts/ai-visibility-core.cjs');
test('frozen prompt sets have stable fingerprints and bounded non-leading prompts',()=>{
 const {validatePrompts,fingerprint}=core();const rows=validatePrompts([{text:'Who supplies cranes in Perth?',category:'buying'}]);assert.equal(rows.length,1);
 assert.equal(fingerprint({a:1,b:2}),fingerprint({b:2,a:1}));assert.notEqual(fingerprint(rows),fingerprint([{...rows[0],text:'Other question?'}]));
 assert.throws(()=>validatePrompts([]));assert.throws(()=>validatePrompts([{text:'same',category:'x'},{text:'same',category:'x'}]));
});
test('evidence counts mentions with word boundaries and exact domain citations, never guesses recommendations',()=>{
 const {analyse,summary}=core();const project={name:'Acme',aliases:['Acme'],domain:'acme.com',competitors:['Other Co']};
 const e=analyse(project,{answer:'Acme and Other Co are options. acmeology is not a brand.',citations:['https://acme.com/service','https://notacme.com/'],recommendation:null});
 assert.equal(e.mentioned,true);assert.equal(e.cited,true);assert.deepEqual(e.competitors,['Other Co']);assert.equal(e.recommendation,null);
 assert.equal(analyse(project,{answer:'acmeology',citations:['https://evil.com/?ref=acme.com']}).mentioned,false);
 const report=summary([{status:'complete',...e},{status:'failed'},{status:'pending'}]);assert.equal(report.mention_rate,100);assert.equal(report.completed,1);assert.equal(report.planned,3);assert.equal(report.recommendation_rate,null);
});
test('manual observation requires dated consumer evidence, never accepts future observations or unsafe URLs',()=>{
 const {validateObservation}=core();const o={answer:'Observed response',model:'ChatGPT web',source_url:'https://chatgpt.com/share/example',observed_at:'2026-01-01T01:00:00Z',citations:[],recommendation:'yes'};
 assert.equal(validateObservation(o).recommendation,'yes');assert.throws(()=>validateObservation({...o,source_url:'javascript:alert(1)'}));assert.throws(()=>validateObservation({...o,observed_at:'2099-01-01'}));assert.throws(()=>validateObservation({...o,answer:''}));
});
test('project validation binds exact public website and supported engines',()=>{
 const {validateProject}=core();const p=validateProject({name:'Example Client',domain:'https://example.com',agency:'Frog Online',engines:['chatgpt','gemini','perplexity'],aliases:['Example Client'],competitors:['Another Co'],market:'Australia',language:'English',repetitions:2});
 assert.equal(p.domain,'example.com');assert.equal(p.repetitions,2);
 for(const domain of ['http://localhost','https://127.0.0.1','https://169.254.169.254','https://a@b.com','not a domain']) assert.throws(()=>validateProject({...p,domain}));
 assert.throws(()=>validateProject({...p,engines:['unknown']}));assert.throws(()=>validateProject({...p,repetitions:30}));
});
