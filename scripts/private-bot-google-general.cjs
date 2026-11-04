'use strict';
const {isDeepStrictEqual:equal}=require('node:util');
const {sheetValuesPlan}=require('./private-bot-sheet-values.cjs');
const sameKeys=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys.sort().join(',');
function tabs(doc){const out=[];const walk=xs=>{for(const x of xs||[]){out.push(x);walk(x.childTabs)}};walk(doc.tabs);return out;}
function selected(doc,id){const hits=tabs(doc).filter(t=>t.tabProperties?.tabId===id);if(hits.length!==1||!hits[0].documentTab?.body)throw Error('INVALID_GOOGLE_FOOTPRINT');return hits[0];}
function text(body){return (body.content||[]).flatMap(x=>x.paragraph?.elements||[]).map(x=>x.textRun?.content||'').join('');}
function nonTarget(doc,id){const c=structuredClone(doc);delete c.revisionId;selected(c,id).documentTab.body={};return c;}
function docPlan(snapshot,args){
 const f=JSON.parse(args.footprint);if(!sameKeys(f,['tabId'])||typeof f.tabId!=='string'||!f.tabId||f.tabId.length>100)throw Error('INVALID_GOOGLE_FOOTPRINT');
 for(const s of [args.expected,args.replacement])if(typeof s!=='string'||!s.endsWith('\n')||s.length>60000||/[\x00-\x08\x0b-\x1f\r]/.test(s))throw Error('GOOGLE_TEXT_BODY_REQUIRED');
 if(args.expected===args.replacement)throw Error('GOOGLE_NO_CHANGE');
 const tab=selected(snapshot.content,f.tabId),body=tab.documentTab.body;
 // Entire plain paragraph body is the explicit target. Never flatten tables,
 // images, suggestions, headers or footnotes into text.
 const walk=x=>{if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(/^suggested/.test(k)&&v&&JSON.stringify(v)!=='{}')throw Error('GOOGLE_COMPLEX_BODY_UNSUPPORTED');walk(v)}};walk(tab.documentTab);
 for(const e of body.content||[]){if(e.sectionBreak&&e.endIndex===1)continue;if(!e.paragraph||e.paragraph.elements?.some(x=>!x.textRun))throw Error('GOOGLE_COMPLEX_BODY_UNSUPPORTED');}
 if(text(body)!==args.expected)throw Error('GOOGLE_SOURCE_CHANGED');
 const requests=[];if(args.expected.length>1)requests.push({deleteContentRange:{range:{tabId:f.tabId,startIndex:1,endIndex:args.expected.length}}});
 if(args.replacement.length>1)requests.push({insertText:{location:{tabId:f.tabId,index:1},text:args.replacement.slice(0,-1)}});
 if(!requests.length)throw Error('GOOGLE_NO_CHANGE');
 return {footprint:f,requests,verify:after=>text(selected(after,f.tabId).documentTab.body)===args.replacement&&equal(nonTarget(after,f.tabId),nonTarget(snapshot.content,f.tabId))};
}
function sheetPlan(snapshot,args){
 const f=JSON.parse(args.footprint);if(!sameKeys(f,['sheetId','row','column'])||!Object.values(f).every(x=>Number.isSafeInteger(x)&&x>=0)||f.row>9999||f.column>701)throw Error('INVALID_GOOGLE_FOOTPRINT');
 const before=JSON.parse(args.expected),after=JSON.parse(args.replacement);
 if(!Array.isArray(before)||!before.length||before.length>100||!Array.isArray(after)||after.length!==before.length)throw Error('GOOGLE_LITERAL_MATRIX_REQUIRED');
 const width=before[0]?.length;if(!width||width>26||before.length*width>500||f.row+before.length>10000||f.column+width>702)throw Error('GOOGLE_LITERAL_MATRIX_REQUIRED');
 const expected=structuredClone(snapshot.content),sheet=expected.sheets?.find(s=>s.properties?.sheetId===f.sheetId);if(!sheet)throw Error('INVALID_GOOGLE_FOOTPRINT');const requests=[];
 for(let r=0;r<before.length;r++){
  if(!Array.isArray(before[r])||before[r].length!==width||!Array.isArray(after[r])||after[r].length!==width)throw Error('GOOGLE_LITERAL_MATRIX_REQUIRED');
  for(let c=0;c<width;c++){
   const old=before[r][c],value=after[r][c];if([old,value].some(v=>typeof v!=='string'||!v||v.length>10000||/^[=+@-]/.test(v)||/[\x00-\x08\x0b-\x1f\r]/.test(v)))throw Error('GOOGLE_LITERAL_MATRIX_REQUIRED');
   const cells=[];for(const g of sheet.data||[]){const rr=f.row+r-(g.startRow||0),cc=f.column+c-(g.startColumn||0);if(rr>=0&&cc>=0&&g.rowData?.[rr]?.values?.[cc])cells.push(g.rowData[rr].values[cc]);}
   if(cells.length!==1||!equal(cells[0].userEnteredValue,{stringValue:old})||cells[0].textFormatRuns||cells[0].chipRuns)throw Error('GOOGLE_LITERAL_CELL_REQUIRED');
   if(old===value)continue;const cell=cells[0];cell.userEnteredValue={stringValue:value};if(cell.effectiveValue)cell.effectiveValue={stringValue:value};if(Object.hasOwn(cell,'formattedValue'))cell.formattedValue=value;
   requests.push({findReplace:{find:old,replacement:value,matchCase:true,matchEntireCell:true,searchByRegex:false,includeFormulas:false,range:{sheetId:f.sheetId,startRowIndex:f.row+r,endRowIndex:f.row+r+1,startColumnIndex:f.column+c,endColumnIndex:f.column+c+1}}});
  }
 }
 if(!requests.length)throw Error('GOOGLE_NO_CHANGE');
 return {footprint:f,requests,verify:content=>equal(content,expected)};
}
function generalPlan(snapshot,args){if(args.operation==='doc_runs')return require('./private-bot-doc-runs.cjs').docRunsPlan(snapshot,args);if(args.operation==='sheet_cells')return require('./private-bot-rich-native.cjs').sheetCellsPlan(snapshot,args);if(args.operation==='sheet_values')return sheetValuesPlan(snapshot,args);if(args.operation==='doc_rewrite')return docPlan(snapshot,args);if(args.operation==='sheet_batch')return sheetPlan(snapshot,args);return null;}
module.exports={generalPlan};
