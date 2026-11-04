'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{isDeepStrictEqual}=require('node:util');
test('canonical receipt comparison tolerates PostgreSQL jsonb key ordering, not changed grants/bytes',()=>{
 const local={response:'accepted',proof:{jobId:'123',candidateSha256:'a',grant:{source:'sheet',taskId:'task'}}};
 const sql={proof:{grant:{taskId:'task',source:'sheet'},candidateSha256:'a',jobId:'123'},response:'accepted'};
 assert.notEqual(JSON.stringify(local),JSON.stringify(sql));assert.ok(isDeepStrictEqual(local,sql));
 sql.proof.candidateSha256='b';assert.equal(isDeepStrictEqual(local,sql),false);
 assert.match(fs.readFileSync(require.resolve('../scripts/private-bot-runtime.cjs'),'utf8'),/isDeepStrictEqual\(fresh,article\)/);
});
