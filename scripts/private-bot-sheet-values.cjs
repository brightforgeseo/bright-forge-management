'use strict';
// Same-original value-only updates. Typed values avoid formula injection by
// inference: only an explicit {formulaValue:'=...'} is a formula; null clears.
const {isDeepStrictEqual:equal}=require('node:util');
const {formulaValidator}=require('./private-bot-sheet-formula.cjs');
function value(v){
 if(v===null||v==='')return {};
 if(typeof v==='string'&&v.length<=10000&&!/[\x00-\x08\x0b-\x1f\r]/.test(v))return {stringValue:v};
 if(typeof v==='number'&&Number.isFinite(v))return {numberValue:v};
 if(typeof v==='boolean')return {boolValue:v};
 if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).join(',')==='formulaValue'&&typeof v.formulaValue==='string'&&v.formulaValue.startsWith('=')&&v.formulaValue.length<=10000&&!/[\x00-\x1f]/.test(v.formulaValue))return {formulaValue:v.formulaValue};
 throw Error('GOOGLE_TYPED_VALUE_REQUIRED');
}
const entered=c=>c?.userEnteredValue||{};
function cellAt(sheet,row,column){
 const found=[];for(const g of sheet.data||[]){const r=row-(g.startRow||0),c=column-(g.startColumn||0);if(r>=0&&c>=0&&g.rowData?.[r]?.values?.[c])found.push(g.rowData[r].values[c]);}
 if(found.length>1)throw Error('GOOGLE_AMBIGUOUS_CELL');return found[0]||{};
}
function projection(content){
 const copy=structuredClone(content);
 for(const sheet of copy.sheets||[]){
  const cells={},grids=[];
  for(const g of sheet.data||[]){const {rowData,startRow=0,startColumn=0,...meta}=g;if(Object.keys(meta).length)grids.push(meta);
   for(let r=0;r<(rowData||[]).length;r++){
    const {values,...rowMeta}=rowData[r];if(Object.keys(rowMeta).length)throw Error('GOOGLE_ROW_METADATA_UNSUPPORTED');
    for(let c=0;c<(values||[]).length;c++){
     const cell=structuredClone(values[c]);
     // Formula results and effective display/conditional formats may recalculate
     // anywhere in the workbook. All entered values/styles/notes/runs remain exact.
     for(const k of ['effectiveValue','formattedValue','effectiveFormat','hyperlink'])delete cell[k];
     if(equal(cell.userEnteredValue,{}))delete cell.userEnteredValue;
     if(Object.keys(cell).length)cells[(startRow+r)+','+(startColumn+c)]=cell;
    }
   }
  }
  sheet.data={grids,cells};
 }
 return copy;
}
function sheetValuesPlan(snapshot,args){
 const f=JSON.parse(args.footprint);
 if(!f||Array.isArray(f)||Object.keys(f).sort().join(',')!=='column,row,sheetId'||!Object.values(f).every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('INVALID_GOOGLE_FOOTPRINT');
 const before=JSON.parse(args.expected),after=JSON.parse(args.replacement);
 if(!Array.isArray(before)||!before.length||before.length>100||!Array.isArray(after)||after.length!==before.length)throw Error('GOOGLE_TYPED_MATRIX_REQUIRED');
 const width=before[0]?.length;
 if(!width||width>26||width*before.length>500)throw Error('GOOGLE_TYPED_MATRIX_REQUIRED');
 const sheet=snapshot.content.sheets?.find(s=>s.properties?.sheetId===f.sheetId),grid=sheet?.properties?.gridProperties;
 if(!grid||f.row+before.length>grid.rowCount||f.column+width>grid.columnCount)throw Error('INVALID_GOOGLE_FOOTPRINT');
 const target=projection(snapshot.content),expectedSheet=target.sheets.find(s=>s.properties.sheetId===f.sheetId);let changed=false,validateFormula;const rows=[];
 for(let r=0;r<before.length;r++){
  if(!Array.isArray(before[r])||!Array.isArray(after[r])||before[r].length!==width||after[r].length!==width)throw Error('GOOGLE_TYPED_MATRIX_REQUIRED');
  const values=[];
  for(let c=0;c<width;c++){
   const old=value(before[r][c]),next=value(after[r][c]),cell=cellAt(sheet,f.row+r,f.column+c);
   if(!equal(entered(cell),old))throw Error('GOOGLE_SOURCE_CHANGED');
   // Expected/baseline formulas are data. Every formula in updateCells is
   // executable, even if identical to an old cell in a mixed replacement.
   if(next.formulaValue){validateFormula||=formulaValidator(snapshot,f.sheetId);validateFormula(next.formulaValue);}
   if(cell.textFormatRuns||cell.chipRuns||sheet.merges?.some(m=>f.row+r>=(m.startRowIndex||0)&&f.row+r<m.endRowIndex&&f.column+c>=(m.startColumnIndex||0)&&f.column+c<m.endColumnIndex))throw Error('GOOGLE_COMPLEX_CELL_UNSUPPORTED');
   const key=(f.row+r)+','+(f.column+c),projected=expectedSheet.data.cells[key]||{};
   if(Object.keys(next).length)projected.userEnteredValue=next;else delete projected.userEnteredValue;
   if(Object.keys(projected).length)expectedSheet.data.cells[key]=projected;else delete expectedSheet.data.cells[key];
   changed||=!equal(old,next);values.push(Object.keys(next).length?{userEnteredValue:next}:{});
  }rows.push({values});
 }
 if(!changed)throw Error('GOOGLE_NO_CHANGE');
 return {footprint:f,requests:[{updateCells:{range:{sheetId:f.sheetId,startRowIndex:f.row,endRowIndex:f.row+before.length,startColumnIndex:f.column,endColumnIndex:f.column+width},rows,fields:'userEnteredValue'}}],verify:content=>equal(projection(content),target),typedValues:true};
}
module.exports={sheetValuesPlan,projection,cellAt};
