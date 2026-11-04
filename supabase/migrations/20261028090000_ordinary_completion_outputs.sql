BEGIN;
CREATE OR REPLACE FUNCTION public.complete_ordinary_echo_chat_job(job_id uuid, worker text, response text)
 RETURNS SETOF chat_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j public.echo_jobs;
BEGIN
 SELECT * INTO j FROM public.echo_jobs WHERE id=job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.locked_by IS DISTINCT FROM worker OR worker IS NULL
 OR j.job_type<>'chat' OR j.locked_at IS NULL OR j.locked_at < clock_timestamp()-interval '300 seconds'
 OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=j.requested_by
  AND u.email_confirmed_at IS NOT NULL AND u.email_confirmed_at<=now()
  AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()))
 OR NOT coalesce(notification_private.channel_access(j.channel_id,j.requested_by),false)
 OR j.source_message_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.chat_messages m
  WHERE m.id=j.source_message_id AND m.sender_id=j.requested_by AND m.channel_id=j.channel_id AND NOT coalesce(m.is_ai,false))
 OR (j.parent_message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.chat_messages m WHERE m.id=j.parent_message_id AND m.channel_id=j.channel_id)) THEN RAISE EXCEPTION 'STALE_JOB_LEASE';END IF;
 RETURN QUERY SELECT * FROM public.complete_echo_chat_job(job_id,response);
END $function$;

-- Four-argument worker path persists bytes and chat completion in the SAME transaction.
-- No defaults: original three-argument RPC remains unambiguous for old workers.
CREATE OR REPLACE FUNCTION public.complete_ordinary_echo_chat_job(job_id uuid, worker text, response text, artifacts jsonb)
RETURNS SETOF public.chat_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF artifacts IS NULL OR jsonb_typeof(artifacts)<>'array' THEN RAISE EXCEPTION 'INVALID_ARTIFACTS'; END IF;
 IF jsonb_array_length(artifacts)>6 OR octet_length(artifacts::text)>8500000 THEN RAISE EXCEPTION 'INVALID_ARTIFACTS'; END IF;
 RETURN QUERY SELECT * FROM public.complete_ordinary_echo_chat_job(job_id,worker,response);
 UPDATE public.echo_jobs SET result=jsonb_build_object('response',response,'artifacts',artifacts,'reply_available',true,'reply_delivered',true,'workflow_complete',false) WHERE id=job_id;
END $$;
REVOKE ALL ON FUNCTION public.complete_ordinary_echo_chat_job(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ordinary_echo_chat_job(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_ordinary_echo_chat_job(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ordinary_echo_chat_job(uuid,text,text,jsonb) TO service_role;

COMMIT;
