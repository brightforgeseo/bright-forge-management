const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('malformed percent encoding returns 400 rather than terminating the portal',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/portal-server.cjs'),'utf8');
 const code=source.slice(source.indexOf('const serveStatic ='),source.indexOf('// ---- server ----'));
 let status,body;const context={};vm.createContext(context);vm.runInContext(code+';globalThis.serve=serveStatic;',context);
 assert.doesNotThrow(()=>context.serve({}, {writeHead:s=>status=s,end:b=>body=b}, {pathname:'/%ZZ'}));
 assert.equal(status,400);assert.ok(body);
});
