const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('services/databaseService.ts','utf8');
function harness(name, cache, supabase) {
 const start=source.indexOf(`export const ${name} =`);
 const end=source.indexOf('\nexport const ',start+1);
 const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const context={exports:{},channelsCacheToken:null,supabase,console:{error(){}},Date,Set,cloneCachedValue:x=>JSON.parse(JSON.stringify(x)),isCacheFresh:c=>c&&c.expiresAt>Date.now(),parseBoardRows:x=>x};
 context[cache]=null;vm.runInNewContext(code,context);return context.exports[name];
}
test('boards retry after response error instead of caching false empty',async()=>{
 let calls=0;
 const supabase={from(){return {select(){return this},not(){return this},order:async()=>++calls===1?{error:new Error('offline')}:{data:[{id:'board'}]}}}};
 const fetch=harness('fetchClientBoards','clientBoardsCache',supabase);
 await assert.rejects(fetch(),/offline/);
 assert.equal((await fetch()).length,1);assert.equal(calls,2);
});
test('channels retry after missing session recovers',async()=>{
 let calls=0;
 const supabase={auth:{getSession:async()=>({data:{session:++calls===1?null:{access_token:'qa-token'}}}),getUser:async()=>({data:{user:{id:'ben'}}})},from(){return {select(){return this},setHeader(){return this},order:async()=>({data:[{id:'chat',is_private:false}]}),eq:async()=>({data:[]})}}};
 const fetch=harness('fetchChannels','channelsCache',supabase);
 await fetch().catch(()=>{});
 assert.equal((await fetch()).length,1);assert.equal(calls,2);
});
