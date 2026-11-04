"""Execute actual PL/pgSQL in a disposable, network-disabled existing image.
No ports, host mounts, credentials, live database, downloads or installs.
--baseline runs applied function definitions; default applies the new migration twice.
"""
import argparse, os, pathlib, re, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
MIGRATION='20261020090000_private_bot_assignment_arrays.sql'
IMAGE='public.ecr.aws/supabase/postgres:17.4.1.069'
def function(file,name):
    text=(ROOT/'supabase/migrations'/file).read_text()
    match=re.search(r'CREATE (?:OR REPLACE )?FUNCTION public\.'+name+r'\(.*?\$\$;',text,re.S)
    if not match:raise RuntimeError('function definition missing: '+name)
    return match[0]
SETUP='''
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz,email_confirmed_at timestamptz,banned_until timestamptz);
CREATE TABLE public.private_bot_owners(owner_id uuid PRIMARY KEY,email text);
CREATE TABLE public.private_bot_jobs(id uuid PRIMARY KEY,owner_id uuid,bot_id uuid,status text,worker_id uuid,lease_expires_at timestamptz);
CREATE TABLE public.private_bot_operations(job_id uuid,owner_id uuid,operation_id text,kind text,input jsonb,state text,receipt jsonb,worker_id uuid,created_at timestamptz DEFAULT now(),finished_at timestamptz,PRIMARY KEY(job_id,operation_id));
CREATE TABLE public.private_bot_artifacts(id uuid DEFAULT gen_random_uuid(),owner_id uuid,bot_id uuid,job_id uuid,name text,format text,content text,binary_base64 text,source_file boolean);
CREATE TABLE public.client_boards(id uuid PRIMARY KEY,board_data jsonb,archived boolean DEFAULT false,updated_at timestamptz);
'''
def main():
    p=argparse.ArgumentParser();p.add_argument('--baseline',action='store_true');p.add_argument('--legacy-only',action='store_true');args=p.parse_args()
    sql=SETUP+'\n'+function('20261016203000_private_bot_confirmed_identity.sql','private_bot_access')+'\n'+function('20261016210000_private_bot_receipts_files.sql','private_bot_operation')+'\n'+function('20261016150000_private_bot_ordinary_work.sql','private_bot_update_task_due_date')+'\n'
    sql+='REVOKE ALL ON FUNCTION public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb),public.private_bot_update_task_due_date(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;\nGRANT EXECUTE ON FUNCTION public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb),public.private_bot_update_task_due_date(uuid,uuid,text,text,text) TO service_role;\n'
    if not args.baseline:
        sql+=(ROOT/'supabase/migrations'/MIGRATION).read_text()+'\n'
        sql+=(ROOT/'supabase/migrations'/MIGRATION).read_text()+'\n'
    checks=(ROOT/'tests/privateBotAssignments.sql').read_text()
    if args.legacy_only:checks=checks.replace("ARRAY['status','dueDate','legacy']","ARRAY['legacy']")
    sql+=checks
    shell="set -eu; initdb -D /dev/shm/assignment-db -A trust --no-locale >/dev/null; pg_ctl -D /dev/shm/assignment-db -o \"-k /dev/shm -c listen_addresses=''\" -l /dev/shm/assignment-pg.log start >/dev/null; psql -X -h /dev/shm -U postgres -d postgres -v ON_ERROR_STOP=1"
    cmd=['/usr/sbin/docker','run','--rm','--pull=never','--network','none','--user','postgres','-i','--entrypoint','/bin/sh',IMAGE,'-c',shell]
    print('ISOLATED COMMAND:',repr(cmd),flush=True)
    result=subprocess.run(cmd,input=sql,text=True,env={'PATH':'/usr/bin:/bin'},timeout=90)
    return result.returncode
if __name__=='__main__':sys.exit(main())
