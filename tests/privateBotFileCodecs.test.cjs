'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseCsv,safeCsv,neutralizeCell}=require('../scripts/private-bot-csv.cjs');
const {encodeFile,decodeFile,prepareUpload,readScopedFile,LIMITS}=require('../scripts/private-bot-files.cjs');
test('CSV quoted commas, escaped quotes, CRLF, multiline, trailing empty cells roundtrip',()=>{
 const input='a,b,c\r\n"a,b","a""b","line\nnext"\r\nx,,\r\n';
 assert.deepEqual(parseCsv(safeCsv(input)),parseCsv(input));
});
test('CSV all dangerous prefixes neutralized, numeric cells preserved, no raw override',()=>{
 for(const s of ['=1+1','+SUM(A1)','-SUM(A1)','@SUM(A1)','\t=1','\n=1',' \r\t+1','\ufeff=1','\t123'])assert.equal(neutralizeCell(s),"'"+s);
 for(const s of ['-12','+12','-0.23','1e-3','+1.25e+3','plain',''])assert.equal(neutralizeCell(s),s);
 assert.equal(parseCsv(safeCsv('"=1+1",-12\n',{raw:true}))[0][0],"'=1+1");
 assert.equal(safeCsv(safeCsv('"=1+1",-12\n')),safeCsv('"=1+1",-12\n'));
});
test('CSV rejects malformed quoting and bounds',()=>{
 for(const s of ['"unterminated','a"b,c','"a"x,b'])assert.throws(()=>safeCsv(s),/CSV/);
 assert.throws(()=>safeCsv('x'.repeat(LIMITS.maxBytes+1)),/LIMIT/);
});
test('actual native DOCX/XLSX/PDF generate and readback bounded bytes',async()=>{
 for(const format of ['docx','pdf']){
  const encoded=await encodeFile({format,name:'report',document:{text:'Verified report\nSource: https://example.com/\nRevised finding'}});
  assert.equal(encoded.name,'report.'+format);assert.ok(Buffer.isBuffer(encoded.bytes));
  const decoded=await decodeFile({format,bytes:encoded.bytes});assert.match(decoded.text,/Verified report/);assert.match(decoded.text,/Revised finding/);
 }
 const e=await encodeFile({format:'xlsx',name:'sheet',document:{rows:[['Title','=1+1','@test'],['-12',42,'line\nnext']]}});
 const d=await decodeFile({format:'xlsx',bytes:e.bytes});
 assert.deepEqual(d.rows,[['Title','=1+1','@test'],['-12',42,'line\nnext']]);
 const revised=await encodeFile({format:'xlsx',name:'revised',document:{rows:[...d.rows,['edited']]}});
 assert.equal((await decodeFile({format:'xlsx',bytes:revised.bytes})).rows[2][0],'edited');
});
test('source-file CSV normalization and native edit never return raw upload bytes',async()=>{
 const csv=await prepareUpload({format:'csv',name:'source.csv',bytes:Buffer.from('"=1+1",-12\n"\t@SUM(A1)",42\n')});
 assert.equal(csv.normalized,true);assert.equal(parseCsv(csv.bytes.toString())[0][0],"'=1+1");
 const input=await encodeFile({format:'docx',name:'original',document:{text:'Original source'}});
 const normalized=await prepareUpload({format:'docx',name:'uploaded.docx',bytes:input.bytes});
 const read=await decodeFile({format:'docx',bytes:normalized.bytes});
 const edited=await encodeFile({format:'docx',name:'edited',document:{text:read.text+'\nNew finding'}});
 assert.equal((await decodeFile({format:'docx',bytes:edited.bytes})).text,'Original source\nNew finding');
 await assert.rejects(()=>decodeFile({format:'txt',bytes:Buffer.from([0xc0,0xaf])}),/UTF8/);
 await assert.rejects(()=>encodeFile({format:'xlsx',name:'sheet',document:{rows:[[{formula:'1+1'}]]}}));
});
test('scope denial before decoding; no paths or unknown fields; strict bytes limit',async()=>{
 const record={owner_id:'owner-a',bot_id:'bot-a',format:'txt',bytes:Buffer.from('private')};
 assert.equal((await readScopedFile({owner_id:'owner-a',bot_id:'bot-a'},record)).text,'private');
 await assert.rejects(()=>readScopedFile({owner_id:'owner-b',bot_id:'bot-a'},record),/FILE_NOT_FOUND/);
 await assert.rejects(()=>readScopedFile({owner_id:'owner-a',bot_id:'bot-b'},record),/FILE_NOT_FOUND/);
 await assert.rejects(()=>decodeFile({format:'txt',bytes:Buffer.from('x'),path:'/etc/passwd'}),/ARGUMENT/);
 await assert.rejects(()=>decodeFile({format:'txt',bytes:Buffer.alloc(LIMITS.maxBytes+1)}),/LIMIT/);
 await assert.rejects(()=>encodeFile({format:'txt',name:'../../escape',document:{text:'x'}}),/NAME/);
});
