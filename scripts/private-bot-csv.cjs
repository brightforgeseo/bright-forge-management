'use strict';
// Strict RFC4180-style parsing; accepts CR/LF/CRLF, never splits quoted cells.
const LIMITS=Object.freeze({maxBytes:2*1024*1024,maxRows:10000,maxColumns:200,maxCells:100000,maxCellChars:32767});
function parseCsv(text){
 if(typeof text!=='string')throw Error('INVALID_CSV');
 if(Buffer.byteLength(text)>LIMITS.maxBytes)throw Error('CSV_LIMIT');
 if(text.includes('\0'))throw Error('INVALID_CSV');
 if(text[0]==='\ufeff')text=text.slice(1);
 if(!text)return [];
 const rows=[];let row=[],cell='',state='start',cells=0,ended=false;
 function field(){if(cell.length>LIMITS.maxCellChars||++cells>LIMITS.maxCells||row.length>=LIMITS.maxColumns)throw Error('CSV_LIMIT');row.push(cell);cell='';state='start';}
 function line(){field();if(rows.length>=LIMITS.maxRows)throw Error('CSV_LIMIT');rows.push(row);row=[];}
 for(let i=0;i<text.length;i++){
  const c=text[i];ended=false;
  if(state==='quoted'){
   if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else state='closed';}else cell+=c;
  }else if(c===','){field();}
  else if(c==='\r'||c==='\n'){line();if(c==='\r'&&text[i+1]==='\n')i++;ended=true;}
  else if(state==='closed')throw Error('INVALID_CSV_QUOTE');
  else if(c==='"'){if(state!=='start')throw Error('INVALID_CSV_QUOTE');state='quoted';}
  else {cell+=c;state='plain';}
  if(cell.length>LIMITS.maxCellChars)throw Error('CSV_LIMIT');
 }
 if(state==='quoted')throw Error('INVALID_CSV_QUOTE');
 if(!ended)line();return rows;
}
function neutralizeCell(value){
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('INVALID_CSV_CELL');return String(value);}
 if(typeof value!=='string')throw Error('INVALID_CSV_CELL');
 if(value.includes('\0'))throw Error('INVALID_CSV_CELL');
 // Strict whole-cell decimal numeric grammar only; whitespace is not a number.
 if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value)))return value;
 // Leading control/format characters are unsafe even before an ordinary value.
 if(/^[\s\p{Cf}]*[=+@-]/u.test(value)||/^[\s\p{Cf}]*[\x00-\x1f\x7f\p{Cf}]/u.test(value))return "'"+value;
 return value;
}
function serializeCsv(rows){
 if(!Array.isArray(rows)||rows.length>LIMITS.maxRows)throw Error('CSV_LIMIT');let cells=0;
 const result=rows.map(row=>{
  if(!Array.isArray(row)||row.length>LIMITS.maxColumns||(cells+=row.length)>LIMITS.maxCells)throw Error('CSV_LIMIT');
  return row.map(v=>{const s=neutralizeCell(v);if(s.length>LIMITS.maxCellChars)throw Error('CSV_LIMIT');return '"'+s.replace(/"/g,'""')+'"';}).join(',');
 }).join('\r\n')+(rows.length?'\r\n':'');
 if(Buffer.byteLength(result)>LIMITS.maxBytes)throw Error('CSV_LIMIT');return result;
}
// Extra options never enable raw export. Every exported serialization is safe.
function safeCsv(text){return serializeCsv(parseCsv(text));}
module.exports={parseCsv,serializeCsv,safeCsv,neutralizeCell,LIMITS};
