BEGIN;
ALTER TABLE public.private_bot_jobs ADD COLUMN request_key text, ADD COLUMN request_payload jsonb;
CREATE UNIQUE INDEX private_bot_request_identity ON public.private_bot_jobs(owner_id,bot_id,request_key) WHERE request_key IS NOT NULL;
ALTER TABLE public.private_bot_artifacts ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE public.private_bot_artifacts DROP CONSTRAINT private_bot_artifacts_format_check;
ALTER TABLE public.private_bot_artifacts ADD CHECK(format IN ('md','csv','json','txt','docx','xlsx','pdf'));
ALTER TABLE public.private_bot_artifacts ADD COLUMN binary_base64 text CHECK(length(binary_base64)<=2800000), ADD COLUMN source_file boolean NOT NULL DEFAULT false, ADD COLUMN upload_key text;
ALTER TABLE public.private_bot_artifacts ADD FOREIGN KEY(bot_id,owner_id) REFERENCES public.private_bots(id,owner_id);
CREATE UNIQUE INDEX private_bot_upload_identity ON public.private_bot_artifacts(owner_id,bot_id,upload_key) WHERE upload_key IS NOT NULL;
CREATE TABLE public.private_bot_operations (
 job_id uuid NOT NULL REFERENCES public.private_bot_jobs(id), owner_id uuid NOT NULL REFERENCES public.private_bot_owners(owner_id),
 operation_id text NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 160), kind text NOT NULL,
 input jsonb NOT NULL, state text NOT NULL CHECK(state IN ('started','completed')), receipt jsonb,
 worker_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 PRIMARY KEY(job_id,operation_id)
);
ALTER TABLE public.private_bot_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_bot_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.private_bot_operations TO authenticated;
GRANT ALL ON public.private_bot_operations TO service_role;
CREATE POLICY private_bot_operations_owned ON public.private_bot_operations FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.private_bot_access(auth.uid()));

CREATE FUNCTION public.private_bot_enqueue(subject uuid, bot uuid, identity_key text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.private_bots; j public.private_bot_jobs;
BEGIN
 IF NOT public.private_bot_access(subject) OR length(identity_key) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 SELECT * INTO b FROM public.private_bots WHERE id=bot AND owner_id=subject FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 SELECT * INTO j FROM public.private_bot_jobs WHERE owner_id=subject AND bot_id=bot AND request_key=identity_key;
 IF j.id IS NOT NULL THEN
  IF j.message IS DISTINCT FROM payload->>'message' OR j.request_payload->'identity' IS DISTINCT FROM payload->'identity' THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT'; END IF;
  RETURN to_jsonb(j);
 END IF;
 INSERT INTO public.private_bot_jobs(bot_id,owner_id,message,status,instructions,context,reference_text,request_key,request_payload)
 VALUES(bot,subject,payload->>'message','pending',b.instructions,b.context,coalesce(payload->>'reference_text',''),identity_key,payload) RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.private_bot_operation(subject uuid, job uuid, worker uuid, op text, operation text, arguments jsonb, phase text, result jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.private_bot_jobs; old public.private_bot_operations; v_receipt jsonb; a public.private_bot_artifacts; data jsonb; g jsonb; t jsonb; gi integer; ti integer; target text[]; hits integer:=0; field_name text;
BEGIN
 SELECT * INTO j FROM public.private_bot_jobs WHERE id=job AND owner_id=subject FOR UPDATE;
 IF j.id IS NULL OR NOT public.private_bot_access(subject) THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 SELECT * INTO old FROM public.private_bot_operations WHERE job_id=job AND operation_id=op;
 IF old.job_id IS NOT NULL AND (old.kind<>operation OR (CASE WHEN operation='save_output' THEN old.input-'binary_base64'<>arguments-'binary_base64' ELSE old.input<>arguments END) OR old.owner_id<>subject) THEN RAISE EXCEPTION 'OPERATION_IDENTITY_CONFLICT'; END IF;
 IF old.state='completed' THEN RETURN jsonb_build_object('reused',true,'receipt',old.receipt); END IF;
 IF j.status<>'running' OR j.worker_id IS DISTINCT FROM worker OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'STALE_JOB_LEASE'; END IF;
 IF phase='finish' THEN
  IF old.job_id IS NULL OR old.worker_id<>worker THEN RAISE EXCEPTION 'OPERATION_NOT_STARTED'; END IF;
  UPDATE public.private_bot_operations SET state='completed',receipt=result,finished_at=clock_timestamp() WHERE job_id=job AND operation_id=op;
  RETURN jsonb_build_object('receipt',result);
 END IF;
 IF phase<>'begin' THEN RAISE EXCEPTION 'INVALID_OPERATION_PHASE'; END IF;
 IF old.job_id IS NOT NULL THEN RAISE EXCEPTION 'OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY'; END IF;
 INSERT INTO public.private_bot_operations(job_id,owner_id,operation_id,kind,input,state,worker_id) VALUES(job,subject,op,operation,arguments,'started',worker);
 IF operation='save_output' THEN
  INSERT INTO public.private_bot_artifacts(owner_id,bot_id,job_id,name,format,content,binary_base64,source_file)
  VALUES(subject,j.bot_id,j.id,arguments->>'name',arguments->>'format',arguments->>'content',arguments->>'binary_base64',false) RETURNING * INTO a;
  v_receipt=jsonb_build_object('saved',true,'artifactId',a.id,'name',a.name,'download','Available in your private Portal outputs. Not published or sent.');
 ELSIF operation IN ('update_my_task_due_date','update_my_task_status') THEN
  SELECT board_data INTO data FROM public.client_boards WHERE id=(arguments->>'board_id')::uuid AND archived=false FOR UPDATE;
  IF data IS NULL OR jsonb_typeof(data->'groups')<>'array' OR coalesce(data->>'name','') ~* '(article.?generation|content.?engine|echo|hermes)' THEN RAISE EXCEPTION 'TASK_UNAVAILABLE'; END IF;
  field_name=CASE WHEN operation='update_my_task_status' THEN 'status' ELSE 'dueDate' END;
  IF field_name='status' AND arguments->>'value' NOT IN ('Not Started','In Progress','For Review','On Hold') THEN RAISE EXCEPTION 'INVALID_TASK_STATUS'; END IF;
  IF field_name='dueDate' AND (arguments->>'value' !~ '^\d{4}-\d{2}-\d{2}$' OR to_char((arguments->>'value')::date,'YYYY-MM-DD')<>arguments->>'value') THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  FOR g,gi IN SELECT value,(ordinality-1)::integer FROM jsonb_array_elements(data->'groups') WITH ORDINALITY LOOP
   IF jsonb_typeof(g->'tasks')<>'array' THEN CONTINUE; END IF;
   FOR t,ti IN SELECT value,(ordinality-1)::integer FROM jsonb_array_elements(g->'tasks') WITH ORDINALITY LOOP
    IF t->>'id'=arguments->>'task_id' THEN
     hits=hits+1;
     IF coalesce(t->>'assignedTo','')<>subject::text OR coalesce(t->>field_name,'')<>arguments->>'expected' OR coalesce(g->>'title',g->>'name','') ~* '(article|content.?engine|echo|hermes)' OR t::text ~* '(article|content.?engine|echo|hermes|credential|publish|send)' THEN RAISE EXCEPTION 'TASK_UNAVAILABLE_OR_CHANGED'; END IF;
     target=ARRAY['groups',gi::text,'tasks',ti::text,field_name];
    END IF;
   END LOOP;
  END LOOP;
  IF hits<>1 OR target IS NULL THEN RAISE EXCEPTION 'TASK_UNAVAILABLE'; END IF;
  UPDATE public.client_boards SET board_data=jsonb_set(data,target,to_jsonb(arguments->>'value'),true),updated_at=clock_timestamp() WHERE id=(arguments->>'board_id')::uuid;
  v_receipt=jsonb_build_object('updated',true,'boardId',arguments->>'board_id','taskId',arguments->>'task_id','field',field_name,'previous',arguments->>'expected','value',arguments->>'value');
 END IF;
 IF v_receipt IS NOT NULL THEN
  UPDATE public.private_bot_operations SET state='completed',receipt=v_receipt,finished_at=clock_timestamp() WHERE job_id=job AND operation_id=op;
  RETURN jsonb_build_object('receipt',v_receipt);
 END IF;
 RETURN jsonb_build_object('started',true);
END $$;

CREATE FUNCTION public.private_bot_upload(subject uuid,bot uuid,identity_key text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.private_bot_artifacts;
BEGIN
 IF NOT public.private_bot_access(subject) OR length(identity_key) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 PERFORM 1 FROM public.private_bots WHERE id=bot AND owner_id=subject FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_DENIED'; END IF;
 SELECT * INTO a FROM public.private_bot_artifacts WHERE owner_id=subject AND bot_id=bot AND upload_key=identity_key;
 IF a.id IS NOT NULL THEN
  IF a.name<>payload->>'name' OR a.binary_base64 IS DISTINCT FROM payload->>'binary_base64' THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT'; END IF;
  RETURN jsonb_build_object('id',a.id,'name',a.name);
 END IF;
 INSERT INTO public.private_bot_artifacts(owner_id,bot_id,name,format,content,binary_base64,source_file,upload_key)
 VALUES(subject,bot,payload->>'name',payload->>'format',payload->>'content',payload->>'binary_base64',true,identity_key) RETURNING * INTO a;
 RETURN jsonb_build_object('id',a.id,'name',a.name);
END $$;

CREATE FUNCTION public.private_bot_finish(subject uuid,job uuid,worker uuid,outcome text,answer text,code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF outcome NOT IN ('completed','failed') THEN RAISE EXCEPTION 'INVALID_OUTCOME'; END IF;
 UPDATE public.private_bot_jobs SET status=outcome,response=CASE WHEN outcome='completed' THEN answer ELSE NULL END,error_code=code,finished_at=clock_timestamp()
 WHERE id=job AND owner_id=subject AND worker_id=worker AND status='running' AND lease_expires_at>clock_timestamp() AND public.private_bot_access(subject);
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.private_bot_enqueue(uuid,uuid,text,jsonb), public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb), public.private_bot_upload(uuid,uuid,text,jsonb), public.private_bot_finish(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_bot_enqueue(uuid,uuid,text,jsonb), public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb), public.private_bot_upload(uuid,uuid,text,jsonb), public.private_bot_finish(uuid,uuid,uuid,text,text,text) TO service_role;
COMMIT;
