'use strict';
// Deliberately small, non-evaluating grammar. Only explicit protected grants
// confer formula authority; preservation snapshots and caller arguments do not.
const {rectangle}=require('./private-bot-business-resources.cjs');
const fail=reason=>{throw Error('GOOGLE_FORMULA_'+reason);};
const scalar=new Map();
function functions(names,min,max=min){for(const n of names.split(' '))scalar.set(n,[min,max]);}
functions('ABS SIGN SQRT INT LEN LOWER UPPER TRIM CLEAN NOT ISNUMBER ISTEXT ISBLANK ISERROR ISNA VALUE N',1);
functions('ROUND ROUNDUP ROUNDDOWN TRUNC',1,2);
functions('MOD POWER EXACT',2);
functions('LEFT RIGHT',1,2);functions('MID',3);functions('SUBSTITUTE',3,4);
functions('IF',2,3);functions('IFERROR',1,2);functions('IFNA',2);
functions('DATE TIME',3);functions('YEAR MONTH DAY HOUR MINUTE SECOND',1);
functions('CONCATENATE',1,100);
const aggregates=new Set('SUM AVERAGE MIN MAX COUNT COUNTA COUNTBLANK PRODUCT AND OR'.split(' '));
const cellPattern=/^\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$/;
function coordinates(s){const m=cellPattern.exec(s);if(!m)fail('REFERENCE_UNSUPPORTED');return {c:[...m[1].toUpperCase()].reduce((n,c)=>26*n+c.charCodeAt(0)-64,0),r:Number(m[2])};}
function tokens(text){
 if(typeof text!=='string'||text[0]!=='='||text.length>10000)fail('SYNTAX');
 const out=[];let i=1;
 while(i<text.length){
  if(text[i]===' '){i++;continue;}
  const q=text[i];
  if(q==='"'||q==="'"){
   i++;let value='',closed=false;
   while(i<text.length){const c=text[i++];if(c===q){if(text[i]===q){value+=q;i++;}else{closed=true;break;}}else{if(c.charCodeAt(0)<32)fail('SYNTAX');value+=c;}}
   if(!closed)fail('SYNTAX');out.push({kind:q==='"'?'string':'sheet',value});
  }else{
   const rest=text.slice(i);let m;
   if((m=/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(rest))){if(!Number.isFinite(Number(m[0])))fail('SYNTAX');out.push({kind:'number',value:m[0]});i+=m[0].length;}
   else if((m=/^[A-Za-z_$][A-Za-z0-9_.$]*/.exec(rest))){out.push({kind:'word',value:m[0]});i+=m[0].length;}
   else if((m=/^(?:<>|<=|>=|[+\-*/^&=<>%(),!:])/.exec(rest))){out.push({kind:m[0],value:m[0]});i+=m[0].length;}
   else fail('SYNTAX_UNSUPPORTED');
  }
  if(out.length>2000)fail('COMPLEXITY_LIMIT');
 }
 out.push({kind:'end'});return out;
}
function formulaValidator(snapshot,targetSheetId){
 const policy=snapshot.grant?.resourcePolicy,scope=policy?.scope;
 if(!policy?.operations?.includes('read')||!policy.operations.includes('native')||!scope||Array.isArray(scope))fail('AUTHORITY_REQUIRED');
 const whole=scope.file===true&&Object.keys(scope).join(',')==='file';
 if(!whole&&(Object.keys(scope).join(',')!=='ranges'||!Array.isArray(scope.ranges)||!scope.ranges.length||scope.ranges.length>100))fail('AUTHORITY_REQUIRED');
 const sheets=snapshot.content.sheets||[];
 const byId=id=>{const hits=sheets.filter(s=>s.properties?.sheetId===id);if(hits.length!==1)fail('SHEET_AMBIGUOUS');return hits[0];};
 const byTitle=title=>{const hits=sheets.filter(s=>s.properties?.title===title);if(hits.length!==1)fail('SHEET_SCOPE');return hits[0];};
 const target=byId(targetSheetId);
 const allowed=whole?[]:scope.ranges.map(a=>{const r=rectangle(a);return {...r,sheetId:byTitle(r.title).properties.sheetId};});
 let cells=0,formulaCount=0;
 function reference(sheet,a,b=a){
  const p=sheet.properties,g=p.gridProperties;
  if(!g||!Number.isSafeInteger(g.rowCount)||!Number.isSafeInteger(g.columnCount)||a.r>b.r||a.c>b.c||b.r>g.rowCount||b.c>g.columnCount)fail('REFERENCE_BOUNDS');
  if(!whole&&!allowed.some(x=>x.sheetId===p.sheetId&&x.title===p.title&&a.r>=x.r1&&b.r<=x.r2&&a.c>=x.c1&&b.c<=x.c2))fail('REFERENCE_SCOPE');
  cells+=(b.r-a.r+1)*(b.c-a.c+1);if(cells>10000)fail('REFERENCE_LIMIT');
  return a.r===b.r&&a.c===b.c?'scalar':'range';
 }
 return formula=>{
  if(++formulaCount>500)fail('COMPLEXITY_LIMIT');
  const ts=tokens(formula);let pos=0,depth=0;
  const peek=()=>ts[pos],take=kind=>{if(peek().kind!==kind)fail('SYNTAX');return ts[pos++];};
  const scalarOnly=x=>{if(x!=='scalar')fail('SPILL_UNSUPPORTED');return x;};
  function primary(){
   if(++depth>64)fail('COMPLEXITY_LIMIT');let type;
   const t=peek();
   if(t.kind==='+'||t.kind==='-'){pos++;type=scalarOnly(primary());}
   else if(t.kind==='('){pos++;type=expression();take(')');}
   else if(t.kind==='number'||t.kind==='string'){pos++;type='scalar';}
   else if(t.kind==='word'||t.kind==='sheet'){
    pos++;
    if(peek().kind==='!'){
     pos++;const sheet=byTitle(t.value),a=coordinates(take('word').value);let b=a;
     if(peek().kind===':'){pos++;b=coordinates(take('word').value);}
     type=reference(sheet,a,b);
    }else if(t.kind==='word'&&peek().kind==='('){
     const name=t.value.toUpperCase(),spec=scalar.get(name),aggregate=aggregates.has(name);
     if(!spec&&!aggregate)fail('FUNCTION_UNSUPPORTED');
     // Workbook named functions can shadow standard functions. Never execute
     // an independently unresolved definition, even with a familiar name.
     if((snapshot.content.namedFunctions||[]).some(f=>String(f.name).toUpperCase()===name))fail('NAMED_FUNCTION_UNSUPPORTED');
     pos++;const args=[];
     if(peek().kind!==')'){do{if(args.length)take(',');args.push(expression());}while(peek().kind===',');}
     take(')');const [min,max]=spec||[1,name==='COUNTBLANK'?1:100];
     if(args.length<min||args.length>max)fail('ARITY_UNSUPPORTED');
     if(!aggregate)args.forEach(scalarOnly);type='scalar';
    }else if(t.kind==='word'&&/^(TRUE|FALSE)$/i.test(t.value)){type='scalar';}
    else if(t.kind==='word'&&cellPattern.test(t.value)){
     if((snapshot.content.namedRanges||[]).some(r=>String(r.name).toUpperCase()===t.value.toUpperCase()))fail('NAMED_REFERENCE_UNSUPPORTED');
     const a=coordinates(t.value);let b=a;if(peek().kind===':'){pos++;b=coordinates(take('word').value);}type=reference(target,a,b);
    }else fail('NAMED_REFERENCE_UNSUPPORTED');
   }else fail('SYNTAX');
   while(peek().kind==='%'){pos++;scalarOnly(type);}
   depth--;return type;
  }
  function expression(){
   let type=primary();
   while(['+','-','*','/','^','&','=','<>','<','>','<=','>='].includes(peek().kind)){pos++;scalarOnly(type);scalarOnly(primary());type='scalar';}
   return type;
  }
  scalarOnly(expression());take('end');return true;
 };
}
module.exports={formulaValidator};
