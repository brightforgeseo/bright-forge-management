BEGIN;
ALTER TABLE public.private_bot_telegram_bindings ADD COLUMN generation uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION public.private_bot_binding_generation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.generation:=gen_random_uuid(); RETURN NEW; END $$;
CREATE TRIGGER private_bot_binding_generation BEFORE UPDATE ON public.private_bot_telegram_bindings FOR EACH ROW EXECUTE FUNCTION public.private_bot_binding_generation();
CREATE TABLE public.private_bot_notifications (
 job_id uuid PRIMARY KEY REFERENCES public.private_bot_jobs(id), owner_id uuid NOT NULL,
 bot_id uuid NOT NULL, chat_id text NOT NULL, message_id text NOT NULL,
 generation uuid NOT NULL, profile text NOT NULL DEFAULT 'default' CHECK(profile='default'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','delivered','uncertain','revoked')),
 lease uuid, lease_until timestamptz, receipt text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(bot_id,owner_id) REFERENCES public.private_bots(id,owner_id)
);
ALTER TABLE public.private_bot_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_bot_notifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.private_bot_notifications TO service_role;
CREATE FUNCTION public.private_bot_telegram_enqueue(subject uuid,bot uuid,telegram_id text,original_message text,lane integer,body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE binding public.private_bot_telegram_bindings; old public.private_bot_jobs; n public.private_bot_notifications; j jsonb; k text;
BEGIN
 IF subject IS NULL OR bot IS NULL OR telegram_id IS NULL OR original_message IS NULL OR lane IS NULL OR body IS NULL OR telegram_id !~ '^[1-9][0-9]{4,19}$' OR original_message !~ '^[1-9][0-9]{0,19}$' OR lane NOT BETWEEN 0 AND 9 OR length(btrim(body)) NOT BETWEEN 1 AND 12000 OR NOT public.private_bot_access(subject) THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 SELECT * INTO binding FROM public.private_bot_telegram_bindings WHERE owner_id=subject AND telegram_user_id=telegram_id FOR UPDATE;
 IF binding.owner_id IS NULL THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 -- Same lock as ordinary enqueue: a Portal collision cannot race subscription creation.
 PERFORM 1 FROM public.private_bots WHERE id=bot AND owner_id=subject FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 k:='telegram:'||telegram_id||':'||original_message||':'||lane;
 SELECT * INTO old FROM public.private_bot_jobs WHERE owner_id=subject AND bot_id=bot AND request_key=k;
 IF old.id IS NOT NULL THEN
  SELECT * INTO n FROM public.private_bot_notifications WHERE job_id=old.id;
  IF n.job_id IS NULL OR n.owner_id<>subject OR n.bot_id<>bot OR n.chat_id<>telegram_id OR n.message_id<>original_message OR n.generation<>binding.generation OR old.message<>body THEN RAISE EXCEPTION 'UNTRUSTED_REQUEST_COLLISION'; END IF;
  RETURN to_jsonb(old);
 END IF;
 j:=public.private_bot_enqueue(subject,bot,k,jsonb_build_object('message',body,'reference_text','','identity',jsonb_build_object('message',body,'publicUrl','','taskId','')));
 INSERT INTO public.private_bot_notifications(job_id,owner_id,bot_id,chat_id,message_id,generation) VALUES((j->>'id')::uuid,subject,bot,telegram_id,original_message,binding.generation);
 RETURN j;
END $$;
CREATE FUNCTION public.private_bot_notification(action text,args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n public.private_bot_notifications; j public.private_bot_jobs; valid boolean;
BEGIN
 IF action='claim' THEN
  UPDATE public.private_bot_notifications SET state='uncertain' WHERE state='sending' AND lease_until<=clock_timestamp();
  UPDATE public.private_bot_notifications o SET state='revoked' WHERE state='pending' AND (NOT public.private_bot_access(o.owner_id) OR NOT EXISTS(SELECT 1 FROM public.private_bot_telegram_bindings b WHERE b.owner_id=o.owner_id AND b.telegram_user_id=o.chat_id AND b.generation=o.generation));
  SELECT o.* INTO n FROM public.private_bot_notifications o JOIN public.private_bot_jobs job ON job.id=o.job_id AND job.owner_id=o.owner_id AND job.bot_id=o.bot_id WHERE o.state='pending' AND job.status IN ('completed','failed') ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1;
  IF n.job_id IS NULL THEN RETURN '{}'::jsonb; END IF;
  UPDATE public.private_bot_notifications SET state='sending',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds' WHERE job_id=n.job_id RETURNING * INTO n;
 ELSE
  SELECT * INTO n FROM public.private_bot_notifications WHERE job_id=(args->>'job_id')::uuid FOR UPDATE;
  IF n.job_id IS NULL OR n.lease IS DISTINCT FROM (args->>'lease')::uuid THEN RETURN '{}'::jsonb; END IF;
  IF action='ack' AND n.state='delivered' THEN RETURN jsonb_build_object('ok',n.receipt=args->>'receipt'); END IF;
  IF n.state<>'sending' THEN RETURN '{}'::jsonb; END IF;
  IF n.lease_until<=clock_timestamp() THEN UPDATE public.private_bot_notifications SET state='uncertain' WHERE job_id=n.job_id; RETURN '{}'::jsonb; END IF;
 END IF;
 SELECT * INTO j FROM public.private_bot_jobs WHERE id=n.job_id AND owner_id=n.owner_id AND bot_id=n.bot_id;
 valid:=j.id IS NOT NULL AND j.status IN ('completed','failed') AND public.private_bot_access(n.owner_id) AND EXISTS(SELECT 1 FROM public.private_bot_telegram_bindings b WHERE b.owner_id=n.owner_id AND b.telegram_user_id=n.chat_id AND b.generation=n.generation);
 IF NOT valid THEN UPDATE public.private_bot_notifications SET state='revoked' WHERE job_id=n.job_id; RETURN '{}'::jsonb; END IF;
 IF action='claim' THEN RETURN to_jsonb(n)||jsonb_build_object('status',j.status,'response',j.response,'error_code',j.error_code); END IF;
 IF action='validate' THEN RETURN jsonb_build_object('ok',true); END IF;
 IF action='ack' AND args->>'receipt' ~ '^[1-9][0-9]{0,19}$' THEN UPDATE public.private_bot_notifications SET state='delivered',receipt=args->>'receipt' WHERE job_id=n.job_id; RETURN jsonb_build_object('ok',true); END IF;
 IF action='uncertain' THEN UPDATE public.private_bot_notifications SET state='uncertain' WHERE job_id=n.job_id; RETURN jsonb_build_object('ok',true); END IF;
 RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.private_bot_binding_generation(), public.private_bot_telegram_enqueue(uuid,uuid,text,text,integer,text),public.private_bot_notification(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_bot_telegram_enqueue(uuid,uuid,text,text,integer,text),public.private_bot_notification(text,jsonb) TO service_role;
COMMIT;
