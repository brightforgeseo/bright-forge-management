'use strict';
const {isDeepStrictEqual:equal}=require('node:util');
const {textStyle}=require('./private-bot-rich-native.cjs');
const STYLE_FIELDS=['bold','italic','underline','strikethrough','fontSize','weightedFontFamily','foregroundColor','backgroundColor','link','baselineOffset'];
function selected(doc,id){const hits=[];function walk(xs){for(const x of xs||[]){if(x.tabProperties?.tabId===id)hits.push(x);walk(x.childTabs)}}walk(doc.tabs);if(hits.length!==1)throw Error('INVALID_GOOGLE_FOOTPRINT');return hits[0];}
function paragraphs(body){const out=[];for(const e of body?.content||[]){if(e.paragraph)out.push(e.paragraph);if(e.table)for(const row of e.table.tableRows||[])for(const c of row.tableCells||[])out.push(...paragraphs(c));}return out;}
// Normalise only provider run segmentation. Keep ALL structural indices, styles,
// paragraph terminators and non-target objects. UTF-16 indices match Docs.
function canonical(doc){const v=structuredClone(doc);delete v.revisionId;const walk=x=>{if(!x||typeof x!=='object')return;if(x.paragraph){const chars=[];for(const e of x.paragraph.elements||[]){if(e.textRun){const {content,...rest}=e.textRun;let index=e.startIndex;for(const c of content){chars.push({...e,startIndex:index,endIndex:index+c.length,textRun:{content:c,...rest}});index+=c.length;}}else chars.push(e)}x.paragraph.elements=chars;}for(const child of Object.values(x))walk(child)};walk(v);return v;}
function docRunsPlan(snapshot,args){
 const f=JSON.parse(args.footprint),old=JSON.parse(args.expected),next=JSON.parse(args.replacement);
 if(!f||Object.keys(f).join(',')!=='tabId'||typeof f.tabId!=='string'||!Array.isArray(old)||!old.length||old.length>100||!Array.isArray(next)||old.length!==next.length)throw Error('INVALID_GOOGLE_FOOTPRINT');
 const result=structuredClone(snapshot.content),tab=selected(result,f.tabId);if(Object.keys(tab.documentTab.namedRanges||{}).length)throw Error('GOOGLE_VARIABLE_NAMED_RANGE_UNSUPPORTED');
 if(/"suggested[^\"]*"\s*:/.test(JSON.stringify(tab.documentTab)))throw Error('GOOGLE_SUGGESTIONS_UNSUPPORTED');
 const ps=paragraphs(tab.documentTab.body),requests=[],indices=new Set(),pairs=old.map((v,i)=>({old:v,next:next[i]})).sort((a,b)=>b.old.startIndex-a.old.startIndex);
 const update=(start,end,style)=>({updateTextStyle:{range:{tabId:f.tabId,startIndex:start,endIndex:end},textStyle:structuredClone(style),fields:STYLE_FIELDS.join(',')}});
 for(const {old:o,next:n} of pairs){
  if(!o||Object.keys(o).sort().join(',')!=='startIndex,text'||!Number.isSafeInteger(o.startIndex)||o.startIndex<1||indices.has(o.startIndex)||!n||Object.keys(n).some(k=>!['text','textStyle','paragraphEndStyle'].includes(k))||typeof o.text!=='string'||!o.text||typeof n.text!=='string'||!n.text||o.text.length+n.text.length>60000||/[\x00-\x1f]/.test(o.text+n.text))throw Error('GOOGLE_RUN_PATCH_INVALID');indices.add(o.startIndex);
  const hits=ps.flatMap(p=>(p.elements||[]).filter(e=>e.startIndex===o.startIndex&&e.textRun).map(e=>({p,e})));if(hits.length!==1)throw Error('GOOGLE_RUN_PATCH_INVALID');const {p,e}=hits[0],content=e.textRun.content,nl=content.endsWith('\n')?'\n':'';
  if(content.slice(0,content.length-nl.length)!==o.text)throw Error('GOOGLE_SOURCE_CHANGED');
  for(const key of ['textStyle','paragraphEndStyle'])if(n[key]!==undefined){textStyle(n[key],true);if(Object.keys(n[key]).some(k=>!STYLE_FIELDS.includes(k)))throw Error('GOOGLE_STYLE_INVALID');}
  const last=p.elements.at(-1);if(!last?.textRun?.content.endsWith('\n'))throw Error('GOOGLE_PARAGRAPH_TERMINATOR_REQUIRED');
  const terminatorIndex=last.endIndex-1,terminatorStyle=structuredClone(n.paragraphEndStyle===undefined?last.textRun.textStyle||{}:n.paragraphEndStyle);
  // Explicit newline restoration is scoped to the final visible run only.
  if(n.paragraphEndStyle!==undefined&&o.startIndex+o.text.length!==terminatorIndex)throw Error('GOOGLE_PARAGRAPH_END_SCOPE');
  const style=structuredClone(n.textStyle===undefined?e.textRun.textStyle||{}:n.textStyle),end=o.startIndex+o.text.length,delta=n.text.length-o.text.length;
  if(o.text!==n.text){requests.push({deleteContentRange:{range:{tabId:f.tabId,startIndex:o.startIndex,endIndex:end}}},{insertText:{location:{tabId:f.tabId,index:o.startIndex},text:n.text}});}
  // A full mask with omitted properties explicitly resets dirty styles to
  // inheritance. An empty object must NOT skip this request.
  requests.push(update(o.startIndex,o.startIndex+n.text.length,style));
  e.textRun.content=n.text;e.textRun.textStyle=style;e.endIndex=end;
  if(nl)p.elements.splice(p.elements.indexOf(e)+1,0,{startIndex:end,endIndex:end+1,textRun:{content:'\n',textStyle:terminatorStyle}});
  else if(last.textRun.content==='\n')last.textRun.textStyle=terminatorStyle;
  else {const endElement=structuredClone(last);last.textRun.content=last.textRun.content.slice(0,-1);last.endIndex--;endElement.startIndex=terminatorIndex;endElement.textRun={...endElement.textRun,content:'\n',textStyle:terminatorStyle};p.elements.push(endElement);}
  const shift=x=>{if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(['startIndex','endIndex'].includes(k)&&typeof v==='number'&&v>=end)x[k]=v+delta;else shift(v)}};shift(tab.documentTab.body);
  // Docs extends full-paragraph formatting to the newline. Restore it LAST,
  // including inherited fields, even when it was a separate run originally.
  requests.push(update(terminatorIndex+delta,terminatorIndex+delta+1,terminatorStyle));
 }
 if(!requests.length||requests.length>300)throw Error('GOOGLE_NO_CHANGE');
 return {footprint:f,requests,richDocument:true,verify:after=>equal(canonical(after),canonical(result))};
}
module.exports={docRunsPlan,canonical};