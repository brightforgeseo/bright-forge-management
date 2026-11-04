'use strict';
// Defence in depth only. Protected namespace, client, lane and current staff
// authority are the primary boundary. Never return/log matched sensitive data.
const fail=()=>{throw Error('BUSINESS_SENSITIVE_CONTENT_WITHHELD');};
const invalid=()=>{throw Error('BUSINESS_TAB_CLASSIFICATION_REQUIRED');};
const normal=s=>s.trim().toLowerCase().replace(/[\s_.-]+/g,'');
const KEY=/^(?:passwords?|passwd|pwd|passphrase|clientsecret|accesstoken|refreshtoken|apikey|privatekey|secretkey|authorization|bearertoken)$/;
const LABEL='(?:passwords?|passwd|pwd|passphrase|client[ _-]?secret|access[ _-]?token|refresh[ _-]?token|api[ _-]?key|private[ _-]?key|secret[ _-]?key|authorization|bearer[ _-]?token)';
const ASSIGN=new RegExp('(?:^|[\\s{,;|])(?:["\']?'+LABEL+'["\']?)[ \\t]*(?:[:=|\\t]|\\r?\\n)[ \\t\\r\\n]*[^\\s|},;]','i');
const BEARER=/\bauthorization["']?\s*[:=|\t\r\n]+\s*["']?bearer\s+\S+/i;
const TOKEN=/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bsk-[A-Za-z0-9]{20,}|\bAIza[A-Za-z0-9_-]{25,}/;
// Port the typed report reader's public_evidence_link credential-key rules.
// Classify URLs embedded in every decoded string, not just target-URL cells.
// No fetching, output rewriting, decoded-secret logging or authority changes.
const URI_KEYS=new Set(['accesstoken','refreshtoken','idtoken','token','apikey','key','secret','clientsecret','password','passwd','pwd','authorization','auth','bearer','credential','credentials','signature','sig','code','session','sessionid','sessiontoken','securitytoken']);
function credentialURI(text){
 for(const match of text.matchAll(/(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s<>"'`]+/gi)){
  let u;try{u=new URL(match[0].startsWith('//')?'https:'+match[0]:match[0]);}catch{fail();}
  if(u.username||u.password)return true;
  const fragment=u.hash.slice(1);
  for(const part of [u.search.slice(1),fragment,fragment.includes('?')?fragment.slice(fragment.indexOf('?')+1):'']){
   for(const [raw,value]of new URLSearchParams(part.replace(/&amp;/gi,'&').replaceAll(';','&'))){
    // URLSearchParams already decoded once. Bound additional encoded-key layers.
    let key=raw;for(let i=0;i<3&&/%[0-9a-f]{2}/i.test(key);i++){let decoded;try{decoded=decodeURIComponent(key);}catch{break;}if(decoded===key)break;key=decoded;}
    if(/%[0-9a-f]{2}/i.test(key))fail();
    key=key.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(URI_KEYS.has(key)||/(?:token|secret|password|signature|credential)$/.test(key)||/^Bearer\s+\S+$/i.test(value))return true;
   }
  }
 }
 return false;
}
function safeText(value){
 let nodes=0,chars=0;const seen=new Set();
 function walk(v,depth){
  if(++nodes>200000||depth>40)throw Error('BUSINESS_CONTENT_LIMIT');
  if(typeof v==='string'){
   chars+=v.length;if(chars>1000000)throw Error('BUSINESS_CONTENT_LIMIT');
   if(ASSIGN.test(v)||BEARER.test(v)||TOKEN.test(v)||credentialURI(v))fail();
   const t=v.trim();if(/^[{[\"]/.test(t)){let decoded;try{decoded=JSON.parse(t);}catch{}if(decoded!==undefined&&decoded!==v)walk(decoded,depth+1);}
   return;
  }
  if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
  if(!v||typeof v!=='object'||seen.has(v))throw Error('BUSINESS_CONTENT_TYPE_INVALID');
  seen.add(v);
  if(Array.isArray(v)){
   // Cell rows/columns: retain actual strings and separators, not JSON escapes.
   const leaves=[];function collect(x){if(typeof x==='string')leaves.push(x);else if(typeof x==='number'||typeof x==='boolean')leaves.push(String(x));else if(Array.isArray(x))x.forEach(collect);}
   if(v.every(x=>x===null||['string','number','boolean'].includes(typeof x)||Array.isArray(x))){collect(v);if(ASSIGN.test(leaves.join('\n'))||BEARER.test(leaves.join('\n')))fail();}
   v.forEach(x=>walk(x,depth+1));
  }else{
   for(const [k,x]of Object.entries(v)){if(KEY.test(normal(k))&&x!==null&&x!==''&&x!==undefined)fail();walk(x,depth+1);}
  }
  seen.delete(v);
 }
 walk(value,0);return value;
}
function privateName(name,folder=false){
 if(typeof name!=='string'||!name.trim())return true;
 const n=name.normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[_.-]+/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:private|credentials?|passwords?|secrets?|tokens?)(?:\.(?:docx|xlsx|pdf))?$/.test(name.trim().toLowerCase()))return true;
 if(/(?:^| )(?:hermes|oauth|payroll|mortgage|banking|personal|ben ?gerry|control plane)(?: |$)/.test(n))return true;
 if(/(?:^| )(?:private owner|owner private|private workspace|private workspaces|private files|private folder|private documents|private backups|ben(?:s| lowe)? private|gerry(?:s| wagner)? private|private ben|private gerry|owner only)(?: |$)/.test(n))return true;
 if(folder&&/(?:^| )(?:credentials?|passwords?|secrets?|tokens?|config|backups?|logins?|usernames?|passcodes?)(?: |$)/.test(n))return true;
 return /^(?:credentials?|secrets?|tokens?|config|backups?)(?: |$)/.test(n);
}
const HEADERS=/^(?:url|page(?: url| title)?|title|meta(?: title| description)?|description|keyword(?:s| [0-9]+)?|clicks|impressions|ctr|position|status|link|issue(?: type)?|priority|action|recommendation|date|month|check|result|count|address|content|h1|h2|alt text|image|notes?)$/i;
function column(header){
 if(typeof header!=='string'||header.length>100)invalid();
 const h=header.trim(),n=normal(h).replace(/[().%]/g,'');
 if(['searchvolume','volume','monthlyvolume','monthlysearchvolume','avgmonthlysearches','averagemonthlysearches','searchespermonth'].includes(n))return 'volume';
 if(['kd','keyworddifficulty','seodifficulty'].includes(n))return 'difficulty';
 if(/^(?:cpc|costperclick)(?:aud|usd|gbp|eur|php)?$/.test(n))return 'cpc';
 if(['intent','searchintent','keywordintent'].includes(n))return 'intent';
 if(['targeturl','targetpage','targetpageurl','landingpage','landingpageurl'].includes(n))return 'target';
 if(!h)return 'empty';
 // Business authority is established by the protected source, not by an SEO
 // vocabulary allowlist. Classify sensitive columns at the typed header boundary.
 if(KEY.test(normal(h))||privateName(h,true)||/\b(?:logins?|usernames?|user ?ids?|passcodes?|otp|2fa|mfa|account ?numbers?|credit ?cards?|cvc|cvv|salary|salaries|payments?)\b/i.test(h))invalid();
 safeText(h);if(!/^[\p{L}\p{N}\s_().%/:&+?,#-]+$/u.test(h))invalid();
 return /^keywords?(?: [0-9]+)?$/i.test(h)?'keyword':'business';
}
function schema(header){
 if(!Array.isArray(header)||!header.length||header.length>200)invalid();
 const cols=header.map(column);if(cols.every(c=>c==='empty'))invalid();
 if(cols.some(c=>['volume','difficulty','cpc','intent','target'].includes(c))&&!cols.includes('keyword'))invalid();return cols;
}
function cell(v,c){
 if(v===null||v==='')return;
 if(typeof v==='string'&&/^\s*=/.test(v))throw Error('BUSINESS_FORMULA_USE_EXACT_RANGE_GRANT');
 if(!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>32767||c==='empty')invalid();
 if(c==='business')return;
 if(c==='keyword'){if(typeof v!=='string')invalid();return;}
 if(c==='intent'){if(typeof v!=='string'||!v.split(/[,;/]+/).every(t=>/^(?:informational|commercial|transactional|navigational|local|i|c|t|n)$/i.test(t.trim())))invalid();return;}
 if(c==='target'){
  if(typeof v!=='string')invalid();if(/^\/(?!\/)[^\s]*$/.test(v))return;
  try{const u=new URL(v);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)invalid();}catch{invalid();}return;
 }
 // Validate display-number strings but return the original type/value unchanged.
 let number=v;
 if(typeof v==='string'){
  let s=v.trim();if(c==='cpc')s=s.replace(/^(?:(?:AUD|USD|GBP|EUR|PHP)\s*|[$£€₱])\s*/i,'');if(c==='difficulty')s=s.replace(/%$/,'');
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))invalid();number=Number(s.replaceAll(',',''));
 }
 if(typeof number!=='number'||!Number.isFinite(number)||number<0||number>(c==='difficulty'?100:1e12))invalid();
}
function safeValues(header,rows,{offset=0,headerRow=false,width=header.length,height=10000}={}){
 const cols=schema(header);if(!Array.isArray(rows)||rows.length>Math.min(height,10000)||!Number.isInteger(offset)||offset<0||offset+width>cols.length)invalid();
 safeText(rows);let total=0;
 rows.forEach((row,i)=>{if(!Array.isArray(row)||row.length>width||(total+=row.length)>100000)invalid();row.forEach((v,j)=>{if(headerRow&&i===0){if(v!==header[j+offset])invalid();}else cell(v,cols[j+offset]);});});return rows;
}
function safeRows(rows){if(!Array.isArray(rows)||!rows.length)invalid();safeText(rows);schema(rows[0]);safeValues(rows[0],rows.slice(1));return rows;}
// Internal, bounded metadata mask. Never permit model-selected field masks.
const VISIBILITY_FIELDS='spreadsheetId,sheets(properties(sheetId,title,hidden,gridProperties),data(startRow,startColumn,rowMetadata(hiddenByUser,hiddenByFilter),columnMetadata(hiddenByUser,hiddenByFilter)))';
function visibility(value,fileId,range,sheetId){
 const bad=()=>{throw Error('GOOGLE_VISIBILITY_METADATA_INVALID');};
 const keys=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(a=>k.includes(a));
 if(!keys(value,['spreadsheetId','sheets'])||value.spreadsheetId!==fileId||!Array.isArray(value.sheets)||value.sheets.length>200)bad();
 const hits=value.sheets.filter(s=>s.properties?.title===range.title);
 if(hits.length!==1)bad();const sheet=hits[0],p=sheet.properties;
 if(!keys(sheet,['properties','data'])||!keys(p,['sheetId','title','hidden','gridProperties'])||p.sheetId!==sheetId||privateName(p.title,true)||p.hidden===true)bad();
 if(p.hidden!==undefined&&typeof p.hidden!=='boolean'||!keys(p.gridProperties,['rowCount','columnCount','frozenRowCount','frozenColumnCount','hideGridlines','rowGroupControlAfter','columnGroupControlAfter'])||!Number.isSafeInteger(p.gridProperties.rowCount)||!Number.isSafeInteger(p.gridProperties.columnCount)||range.r2>p.gridProperties.rowCount||range.c2>p.gridProperties.columnCount)bad();
 if(sheet.data!==undefined&&!Array.isArray(sheet.data)||sheet.data?.length>1)bad();
 let hidden=false;
 for(const g of sheet.data||[]){
  if(!keys(g,['startRow','startColumn','rowMetadata','columnMetadata']))bad();
  const row=g.startRow??0,col=g.startColumn??0;
  if(!Number.isSafeInteger(row)||!Number.isSafeInteger(col)||row!==range.r1-1||col!==range.c1-1)bad();
  for(const [name,max] of [['rowMetadata',range.r2-range.r1+1],['columnMetadata',range.c2-range.c1+1]]){
   const values=g[name]??[];if(!Array.isArray(values)||values.length>max)bad();
   for(const d of values){if(!keys(d,['hiddenByUser','hiddenByFilter'])||Object.values(d).some(x=>typeof x!=='boolean'))bad();if(d.hiddenByUser||d.hiddenByFilter)hidden=true;}
  }
 }
 return {hidden};
}
module.exports={safeText,safeRows,safeValues,privateName,VISIBILITY_FIELDS,visibility};
