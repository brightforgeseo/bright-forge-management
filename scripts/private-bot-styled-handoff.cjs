'use strict';
const {isDeepStrictEqual:equal}=require('node:util');
function styledArtifact(a){let value;try{value=JSON.parse(a.content)}catch{return null}if(!value?.privateBotDesignV1)return null;if(!['docx','xlsx'].includes(a.format)||!a.binary_base64||Object.keys(value).sort().join(',')!=='privateBotDesignV1,projection')throw Error('GOOGLE_STYLED_BYTES_REQUIRED');const bytes=Buffer.from(a.binary_base64,'base64');if(bytes.length>120000||!bytes.subarray(0,2).equals(Buffer.from('PK')))throw Error('GOOGLE_STYLED_BYTES_REQUIRED');return {design:value.privateBotDesignV1,projection:value.projection,mediaBase64:a.binary_base64,mediaMime:require('./private-bot-files.cjs').MIME[a.format]};}
function verifyStyled(style,format,native){
 const d=style.design;
 if(format==='xlsx'){
  if(!Array.isArray(native.sheets)||native.sheets.length!==d.sheets.length)return false;
  for(const expected of d.sheets){const matches=native.sheets.filter(s=>s.properties?.title===expected.name);if(matches.length!==1)return false;const sheet=matches[0],at=(r,c)=>{for(const g of sheet.data||[]){const row=r-(g.startRow||0),col=c-(g.startColumn||0);if(row>=0&&col>=0&&g.rowData?.[row]?.values?.[col])return g.rowData[row].values[col]}return {}};
   for(let r=0;r<expected.rows.length;r++)for(let c=0;c<expected.rows[r].length;c++){const v=expected.rows[r][c],cell=at(r,c),entered=cell.userEnteredValue||{};if(typeof v==='number'?entered.numberValue!==v:entered.stringValue!==v&&!(v===''&&!Object.keys(entered).length))return false;if(r<(expected.headerRows??1)&&cell.effectiveFormat?.textFormat?.bold!==true)return false;}
   if((expected.headerRows??1)>0&&sheet.properties.gridProperties?.frozenRowCount!==(expected.headerRows??1))return false;
  }return true;
 }
 const paragraphs=[],tables=[];function walk(body){for(const x of body?.content||[]){if(x.paragraph){const text=(x.paragraph.elements||[]).map(e=>e.textRun?.content||'').join('').replace(/\n$/,'');if(text)paragraphs.push({text,p:x.paragraph});}if(x.table){const rows=x.table.tableRows.map(r=>r.tableCells.map(c=>c.content.filter(x=>x.paragraph).map(x=>x.paragraph.elements.map(e=>e.textRun?.content||'').join('').replace(/\n$/,'')).join('\n')));tables.push(rows);for(const row of x.table.tableRows)for(const c of row.tableCells)walk(c);}}}walk(native.body);
 const expected=[];if(d.title)expected.push(d.title);for(const b of d.blocks)if(b.table)for(const row of b.table)expected.push(...row);else expected.push(b.text);
 if(!equal(paragraphs.map(x=>x.text),expected.filter(Boolean))||!equal(tables,d.blocks.filter(b=>b.table).map(b=>b.table)))return false;
 for(const b of d.blocks)if(b.style==='heading1'||b.style==='heading2'){const p=paragraphs.find(p=>p.text===b.text)?.p;if(p?.paragraphStyle?.namedStyleType!==('HEADING_'+b.style.at(-1)))return false;}
 return true;
}
module.exports={styledArtifact,verifyStyled};
