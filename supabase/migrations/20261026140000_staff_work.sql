-- Separate ordinary Echo namespace, reusing protected bot jobs/operations.
-- Additive, no existing bot history, assignments or credentials changed.
BEGIN;
ALTER TABLE public.private_bots DROP CONSTRAINT private_bots_slot_check;
ALTER TABLE public.private_bots ADD CONSTRAINT private_bots_slot_check CHECK(slot BETWEEN 0 AND 10);
ALTER TABLE public.private_bots ADD CONSTRAINT ordinary_echo_identity CHECK(slot<>0 OR (name='Echo' AND instructions='' AND context=''));

CREATE FUNCTION public.ordinary_echo_begin(subject uuid, session uuid, request text, attempt uuid DEFAULT gen_random_uuid()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.private_bots; j public.private_bot_jobs;
BEGIN
 IF NOT public.private_bot_access(subject) OR session IS NULL OR request IS NULL OR length(request) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 INSERT INTO public.private_bots(owner_id,slot,name) VALUES(subject,0,'Echo') ON CONFLICT(owner_id,slot) DO NOTHING;
 SELECT * INTO b FROM public.private_bots WHERE owner_id=subject AND slot=0 FOR UPDATE;
 SELECT * INTO j FROM public.private_bot_jobs WHERE owner_id=subject AND bot_id=b.id AND request_key='echo:'||session::text;
 IF j.id IS NOT NULL THEN
  IF j.message<>request THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT'; END IF;
  IF j.status='completed' THEN RETURN to_jsonb(j)||'{"reused":true}'::jsonb; END IF;
  RAISE EXCEPTION 'OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY';
 END IF;
 UPDATE public.private_bot_jobs SET status='failed',error_code='WORKER_LEASE_EXPIRED',finished_at=clock_timestamp()
 WHERE bot_id=b.id AND status='running' AND lease_expires_at<=clock_timestamp();
 INSERT INTO public.private_bot_jobs(bot_id,owner_id,message,status,worker_id,started_at,lease_expires_at,request_key,request_payload)
 VALUES(b.id,subject,request,'running',attempt,clock_timestamp(),clock_timestamp()+interval '5 minutes','echo:'||session::text,jsonb_build_object('workspace_kind','echo')) RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.ordinary_echo_begin(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ordinary_echo_begin(uuid,uuid,text,uuid) TO service_role;

CREATE FUNCTION public.ordinary_echo_control(subject uuid, session uuid, action text, worker uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.private_bot_jobs;
BEGIN
 IF NOT public.private_bot_access(subject) OR action NOT IN ('cancel','ping') THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 SELECT jobs.* INTO j FROM public.private_bot_jobs jobs JOIN public.private_bots bots ON bots.id=jobs.bot_id AND bots.owner_id=jobs.owner_id
 WHERE jobs.owner_id=subject AND bots.slot=0 AND jobs.request_key='echo:'||session::text AND jobs.worker_id=worker FOR UPDATE OF jobs;
 IF j.id IS NULL THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 IF action='cancel' THEN
  UPDATE public.private_bot_jobs SET status='failed',error_code='OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY',finished_at=clock_timestamp()
  WHERE id=j.id AND status='running';
  RETURN jsonb_build_object('cancelled',FOUND,'receiptsRetained',true);
 END IF;
 IF j.status<>'running' OR j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'STALE_JOB_LEASE'; END IF;
 UPDATE public.private_bot_jobs SET lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id=j.id;
 RETURN jsonb_build_object('renewed',true);
END $$;
REVOKE ALL ON FUNCTION public.ordinary_echo_control(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ordinary_echo_control(uuid,uuid,text,uuid) TO service_role;

CREATE FUNCTION public.complete_ordinary_echo_chat_job(job_id uuid, worker text, response text) RETURNS SETOF public.chat_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.echo_jobs;
BEGIN
 SELECT * INTO j FROM public.echo_jobs WHERE id=job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.locked_by IS DISTINCT FROM worker OR worker IS NULL
 OR NOT public.private_bot_access(j.requested_by) THEN RAISE EXCEPTION 'STALE_JOB_LEASE';END IF;
 RETURN QUERY SELECT * FROM public.complete_echo_chat_job(job_id,response);
END $$;
REVOKE ALL ON FUNCTION public.complete_ordinary_echo_chat_job(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ordinary_echo_chat_job(uuid,text,text) TO service_role;

CREATE TABLE public.private_bot_work_memory (
 owner_id uuid NOT NULL, bot_id uuid NOT NULL, key text NOT NULL CHECK(key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$'),
 content text NOT NULL CHECK(length(content)<=6000), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,bot_id,key), FOREIGN KEY(bot_id,owner_id) REFERENCES public.private_bots(id,owner_id)
);
ALTER TABLE public.private_bot_work_memory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_bot_work_memory FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.private_bot_work_memory TO service_role;
-- No direct browser grant. All reads and writes are owner+bot+live-job bound.
CREATE FUNCTION public.private_bot_memory(subject uuid, job uuid, worker uuid, action text, args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.private_bot_jobs; prior text; result jsonb; old public.private_bot_operations; op text;
BEGIN
 SELECT * INTO j FROM public.private_bot_jobs WHERE id=job AND owner_id=subject FOR UPDATE;
 IF j.id IS NULL OR NOT public.private_bot_access(subject) THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 IF j.status<>'running' OR j.worker_id IS DISTINCT FROM worker OR j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'STALE_JOB_LEASE'; END IF;
 IF action='recall' THEN
  IF args - 'query' <> '{}'::jsonb OR jsonb_typeof(args->'query') IS DISTINCT FROM 'string' OR length(args->>'query')>200 THEN RAISE EXCEPTION 'INVALID_MEMORY_ARGUMENTS'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]') INTO result FROM (
   SELECT key,content,updated_at FROM public.private_bot_work_memory WHERE owner_id=subject AND bot_id=j.bot_id
   AND (position(lower(args->>'query') in lower(key||' '||content))>0) ORDER BY updated_at DESC,key LIMIT 40
  ) m;
  RETURN jsonb_build_object('memories',result,'scope','own-workspace','untrustedData',true);
 ELSIF action='save' THEN
  IF args - ARRAY['key','content','expected'] <> '{}'::jsonb OR jsonb_typeof(args->'key') IS DISTINCT FROM 'string' OR jsonb_typeof(args->'content') IS DISTINCT FROM 'string' OR jsonb_typeof(args->'expected') IS DISTINCT FROM 'string' OR (args->>'key') !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$' OR length(args->>'content')>6000 OR length(args->>'expected')>6000 THEN RAISE EXCEPTION 'INVALID_MEMORY_ARGUMENTS'; END IF;
  op='memory:'||md5(args::text);
  SELECT * INTO old FROM public.private_bot_operations WHERE job_id=job AND operation_id=op;
  IF old.job_id IS NOT NULL THEN
   IF old.input<>args OR old.owner_id<>subject OR old.worker_id<>worker THEN RAISE EXCEPTION 'OPERATION_IDENTITY_CONFLICT'; END IF;
   RETURN old.receipt;
  END IF;
  SELECT content INTO prior FROM public.private_bot_work_memory WHERE owner_id=subject AND bot_id=j.bot_id AND key=args->>'key';
  IF coalesce(prior,'')<>args->>'expected' THEN RAISE EXCEPTION 'MEMORY_CHANGED'; END IF;
  IF prior IS NULL AND (SELECT count(*) FROM public.private_bot_work_memory WHERE owner_id=subject AND bot_id=j.bot_id)>=100 THEN RAISE EXCEPTION 'MEMORY_LIMIT'; END IF;
  INSERT INTO public.private_bot_work_memory(owner_id,bot_id,key,content) VALUES(subject,j.bot_id,args->>'key',args->>'content')
  ON CONFLICT(owner_id,bot_id,key) DO UPDATE SET content=EXCLUDED.content,updated_at=clock_timestamp();
  result=jsonb_build_object('saved',true,'key',args->>'key','content',args->>'content','scope','own-workspace');
  INSERT INTO public.private_bot_operations(job_id,owner_id,operation_id,kind,input,state,worker_id,receipt,finished_at)
  VALUES(job,subject,op,'save_my_work_memory',args,'completed',worker,result,clock_timestamp());
  RETURN result;
 END IF;
 RAISE EXCEPTION 'INVALID_MEMORY_ACTION';
END $$;
REVOKE ALL ON FUNCTION public.private_bot_memory(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_bot_memory(uuid,uuid,uuid,text,jsonb) TO service_role;
-- Native Echo already has its own model turn. It must not occupy the private
-- worker's two-model pool or be claimed as another private bot task.
CREATE OR REPLACE FUNCTION public.claim_private_bot_job(worker_name uuid) RETURNS SETOF public.private_bot_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(81401640);
 UPDATE public.private_bot_jobs SET status='failed',error_code='WORKER_LEASE_EXPIRED',finished_at=now()
 WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<now());
 IF (SELECT count(*) FROM public.private_bot_jobs j JOIN public.private_bots b ON b.id=j.bot_id WHERE j.status='running' AND b.slot>0)>=2 THEN RETURN; END IF;
 SELECT j.id INTO target FROM public.private_bot_jobs j JOIN public.private_bots b ON b.id=j.bot_id
 WHERE j.status='pending' AND b.slot>0 ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF target IS NOT NULL THEN
 RETURN QUERY UPDATE public.private_bot_jobs SET status='running',worker_id=worker_name,
 started_at=now(),lease_expires_at=now()+interval '300 seconds' WHERE id=target AND status='pending' RETURNING *;
 END IF;
END $$;
COMMIT;
