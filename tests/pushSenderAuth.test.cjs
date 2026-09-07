const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const ts=require('typescript');const path=require('node:path');
function handler(){
 let fn;let dbCalls=0;
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/send-push/index.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{exports:{},require:(name)=>name.includes('http/server')?{serve:f=>fn=f}:name.includes('supabase-js')?{createClient:()=>{dbCalls++;throw new Error('Database must not be accessed');}}:{setVapidDetails(){}},Deno:{env:{get:k=>({SUPABASE_SERVICE_ROLE_KEY:'isolated-service-key',VAPID_PUBLIC_KEY:'fixture-public',VAPID_PRIVATE_KEY:'fixture-private'}[k]||'')}},Request,Response,console,Promise});
 return {invoke:r=>fn(r),dbCalls:()=>dbCalls};
}
test('send-push rejects unauthenticated callers before database access',async()=>{
 const h=handler();const r=await h.invoke(new Request('https://fixture.invalid/send-push',{method:'POST',body:JSON.stringify({userId:'other-user',title:'fixture'})}));
 assert.equal(r.status,401);assert.equal(h.dbCalls(),0);
});
test('send-push rejects a non-service bearer before database access',async()=>{
 const h=handler();const r=await h.invoke(new Request('https://fixture.invalid/send-push',{method:'POST',headers:{authorization:'Bearer isolated-anon-key'},body:JSON.stringify({userId:'other-user',title:'fixture'})}));
 assert.equal(r.status,401);assert.equal(h.dbCalls(),0);
});
