'use strict';
const path=require('node:path');const {spawn}=require('node:child_process');
const {parseCsv,safeCsv,serializeCsv,LIMITS}=require('./private-bot-csv.cjs');
const MIME=Object.freeze({txt:'text/plain; charset=utf-8',md:'text/markdown; charset=utf-8',csv:'text/csv; charset=utf-8',json:'application/json; charset=utf-8',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf'});
const MAX_TEXT=60000;let active=0;
function exact(args,keys){if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(args,k)))throw Error('INVALID_FILE_ARGUMENTS');}
function formatCheck(format){if(!Object.hasOwn(MIME,format))throw Error('UNSUPPORTED_FILE_FORMAT');}
function checkBytes(bytes){if(!Buffer.isBuffer(bytes))throw Error('INVALID_FILE_BYTES');if(bytes.length>LIMITS.maxBytes)throw Error('FILE_LIMIT');return bytes;}
function checkText(text){if(typeof text!=='string'||text.length>MAX_TEXT||Buffer.byteLength(text)>LIMITS.maxBytes)throw Error('TEXT_LIMIT');if(/[\x00\uD800-\uDFFF]/u.test(text))throw Error('INVALID_TEXT');return text;}
function decodeText(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('INVALID_UTF8');}}
function fileName(name,format){if(typeof name!=='string'||!name||name.length>180||! /^[a-zA-Z0-9][a-zA-Z0-9 ()_.-]*$/.test(name)||name.includes('..'))throw Error('INVALID_FILE_NAME');return name.replace(/\.(txt|md|csv|json|docx|xlsx|pdf)$/i,'')+'.'+format;}
function native(request){
 if(active>=2)return Promise.reject(Error('FILE_CODEC_BUSY'));
 const input=JSON.stringify(request);if(Buffer.byteLength(input)>4*LIMITS.maxBytes)return Promise.reject(Error('FILE_LIMIT'));
 active++;
 return new Promise((resolve,reject)=>{
  // Deliberately not model-selectable; no shell, account credentials or path input.
  const child=spawn('/usr/bin/python3',['-B',path.join(__dirname,'private-bot-formats.py')],{cwd:__dirname,env:{PATH:'/usr/bin:/usr/sbin',LANG:'C.UTF-8'},detached:true,stdio:['pipe','pipe','pipe']});
  let chunks=[],size=0,failed=false,done=false;
  function stop(){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
  const timer=setTimeout(()=>{failed=true;stop();},15000);
  function finish(error,result){if(done)return;done=true;clearTimeout(timer);active--;if(error)reject(error);else resolve(result);}
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>4*LIMITS.maxBytes){failed=true;stop();}else chunks.push(chunk);});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.on('error',()=>finish(Error('FILE_CODEC_UNAVAILABLE')));
  child.on('close',code=>{if(code||failed)return finish(Error('INVALID_OR_UNSUPPORTED_FILE'));try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(result.error)throw Error();finish(null,result);}catch{finish(Error('INVALID_OR_UNSUPPORTED_FILE'));}});
  child.stdin.end(input);
 });
}
async function decodeFile(args){
 exact(args,['format','bytes']);const {format,bytes}=args;formatCheck(format);checkBytes(bytes);
 if(['docx','xlsx','pdf'].includes(format))return native({operation:'decode',format,base64:bytes.toString('base64')});
 const text=decodeText(bytes);
 if(format==='csv')return {rows:parseCsv(text),projection:'CSV cells; export must use encodeFile or safeCsv'};
 checkText(text);if(format==='json')JSON.parse(text);return {text};
}
async function encodeFile(args){
 exact(args,['format','name','document']);const {format,document}=args;formatCheck(format);const name=fileName(args.name,format);
 let bytes;
 if(document&&Object.keys(document).join(',')==='design'&&['docx','xlsx'].includes(format)){
  const r=await native({operation:'encode',format,document});bytes=Buffer.from(r.base64,'base64');checkBytes(bytes);checkText(r.projection);return {name,format,mime:MIME[format],bytes,projection:r.projection,styled:true};
 }
 if(format==='xlsx'||format==='csv'){
  exact(document,['rows']);
  // Validate cells and row/column bounds before subprocess. XLSX uses explicit
  // inlineStr for ALL strings, never formula types. CSV additionally prefixes.
  serializeCsv(document.rows);
  bytes=format==='csv'?Buffer.from(serializeCsv(document.rows)):Buffer.from((await native({operation:'encode',format,document})).base64,'base64');
 }else{
  exact(document,['text']);checkText(document.text);
  if(['docx','pdf'].includes(format))bytes=Buffer.from((await native({operation:'encode',format,document})).base64,'base64');
  else{if(format==='json')JSON.parse(document.text);bytes=Buffer.from(document.text);}
 }
 checkBytes(bytes);return {name,format,mime:MIME[format],bytes};
}
async function prepareUpload(args){
 exact(args,['format','name','bytes']);fileName(args.name,args.format);
 const read=await decodeFile({format:args.format,bytes:args.bytes});
 if(args.format==='xlsx'){
  const result=await native({operation:'normalise',format:'xlsx',base64:args.bytes.toString('base64')});
  return {name:fileName(args.name,args.format),format:args.format,mime:MIME.xlsx,bytes:Buffer.from(result.base64,'base64'),projection:read.projection,normalized:true};
 }
 const document=read.rows?{rows:read.rows}:{text:read.text};
 return {...await encodeFile({format:args.format,name:args.name,document}),projection:read.projection||'text',normalized:true};
}
async function readScopedFile(principal,record){
 // Both records MUST come from server-authenticated identity/scoped DB lookup,
 // never accept owner/bot claims from a model or HTTP payload as authentication.
 if(!principal?.owner_id||!principal?.bot_id||!record||record.owner_id!==principal.owner_id||record.bot_id!==principal.bot_id)throw Error('FILE_NOT_FOUND');
 return decodeFile({format:record.format,bytes:record.bytes});
}
module.exports={encodeFile,decodeFile,prepareUpload,readScopedFile,safeCsv,LIMITS,MIME};
