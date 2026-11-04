const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const tick=()=>new Promise(r=>setTimeout(r,5));
function fixture(){
 const file=ts.createSourceFile('App.tsx',fs.readFileSync('App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
 (function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='handleUserSession')handler=node.initializer.getText(file);ts.forEachChild(node,visit);})(file);
 assert.ok(handler);let resolve;const lookup=new Promise(r=>resolve=r);const state={authenticated:false,user:{id:'guest'}};
 const query={select(){return this;},eq(){return this;},single(){return lookup;}};
 const sandbox={sessionIdentityRef:{current:'fixture-a'},sessionRevisionRef:{current:1},userSessionDebounceRef:{current:null},setCurrentUser:value=>{state.user=typeof value==='function'?value(state.user):value;},setIsAuthenticated:value=>state.authenticated=value,supabase:{from:()=>query},normalizeSupabaseAssetUrl:x=>x,console:{log(){},warn(){},error(){}},setTimeout:(f)=>setTimeout(f,0),clearTimeout,Date,localStorage:{getItem:()=> '2099-01-01'},window:{setTimeout(){}},checkDueDateNotifications:async()=>{}};
 const run=vm.runInNewContext(ts.transpileModule(`(${handler})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 return {run,state,sandbox,resolve};
}
test('actual App handler admits verified identity without waiting for profile network',async()=>{const f=fixture();await f.run('fixture-a','a@example.invalid','Fixture A');await tick();assert.equal(f.state.authenticated,true);assert.equal(f.state.user.id,'fixture-a');f.resolve({data:null});await tick();});
test('actual App handler never accepts a caller that is not the verified identity',async()=>{const f=fixture();await f.run('fixture-b','b@example.invalid','Fixture B');await tick();assert.equal(f.state.authenticated,false);f.resolve({data:null});await tick();assert.equal(f.state.authenticated,false);});
test('profile response from an old login cannot overwrite a new same-user session',async()=>{const f=fixture();await f.run('fixture-a','a@example.invalid','Old name');await tick();f.sandbox.sessionRevisionRef.current++;f.state.user={id:'fixture-a',name:'New session'};f.resolve({data:{full_name:'Old profile'}});await tick();assert.equal(f.state.user.name,'New session');});
