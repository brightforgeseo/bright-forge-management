'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');
const sql=q=>execFileSync('docker',['exec','-i','supabase_db_bright-forge-management','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
test('visibility tables deny direct authenticated and anonymous access',()=>{
 assert.equal(sql("select count(*) from pg_tables where schemaname='public' and tablename in ('ai_visibility_projects','ai_visibility_runs','ai_visibility_samples')"),'3');
 assert.equal(sql("select count(*) from pg_tables where schemaname='public' and tablename like 'ai_visibility_%' and rowsecurity"),'3');
 assert.equal(sql("select has_table_privilege('anon','public.ai_visibility_projects','SELECT') or has_table_privilege('authenticated','public.ai_visibility_samples','SELECT')"),'f');
});
