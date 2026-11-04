const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');const {createPrivateBotsHandler}=require('../scripts/portal-private-bots.cjs');
test('native CSV upload and historical download preserve actual safe CSV bytes',async()=>{
 const owner='a1e57188-a322-42b2-9d33-b5df08033685',bot='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';let saved;
 const api=async(p,m,b)=>{if(p.includes('/private_bots?'))return [{id:bot,owner_id:owner}];if(p.endsWith('/private_bot_upload')){saved={...b.payload,id};return {id};}if(p.includes('/private_bot_artifacts?'))return [saved];throw Error(p);};
 const s=http.createServer(createPrivateBotsHandler({authenticate:async()=>({id:owner}),api}));await new Promise(r=>s.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${s.address().port}/api/private-bots/${bot}/artifacts`;
 try{const input='name,value\r\nformula,=1+1\r\nnumber,-42.5\r\n';let r=await fetch(url,{method:'POST',body:JSON.stringify({name:'qa.csv',format:'csv',base64:Buffer.from(input).toString('base64'),requestKey:'test-upload-key'})});assert.equal(r.status,201);assert.deepEqual(require('../scripts/private-bot-csv.cjs').parseCsv(saved.content)[0],['name','value']);
 saved.content=JSON.stringify([['old','broken-projection']]);r=await fetch(url+'/'+id);assert.equal(r.status,200);const a=(await r.json()).artifact;assert.ok(a.content.includes("'=1+1"));assert.deepEqual(require('../scripts/private-bot-csv.cjs').parseCsv(a.content)[2],['number','-42.5']);assert.equal(Buffer.from(a.binary_base64,'base64').toString(),a.content);
 }finally{await new Promise(r=>s.close(r));}
});
