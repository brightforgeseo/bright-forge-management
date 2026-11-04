-- Exact-owner assignment compatibility only. Existing eligibility, lease, receipt,
-- expected-value and control-plane gates are retained from the deployed functions.
-- Idempotent: replaces functions in place; never edits or replays applied migrations.
BEGIN;
CREATE OR REPLACE FUNCTION public.private_bot_operation(subject uuid, job uuid, worker uuid, op text, operation text, arguments jsonb, phase text, result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     IF NOT coalesce(CASE jsonb_typeof(t->'assignedTo')
      WHEN 'string' THEN t->>'assignedTo'=subject::text
      WHEN 'array' THEN (t->'assignedTo') ? subject::text AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(t->'assignedTo') AS assigned(id) WHERE jsonb_typeof(id)<>'string')
      ELSE false END,false) OR coalesce(t->>field_name,'')<>arguments->>'expected' OR coalesce(g->>'title',g->>'name','') ~* '(article|content.?engine|echo|hermes)' OR t::text ~* '(article|content.?engine|echo|hermes|credential|publish|send)' THEN RAISE EXCEPTION 'TASK_UNAVAILABLE_OR_CHANGED'; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.private_bot_update_task_due_date(subject uuid, board_id uuid, task_id text, expected_date text, due_date text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE data jsonb; g jsonb; t jsonb; gi integer; ti integer; matches integer:=0; target_path text[];
BEGIN
 IF NOT public.private_bot_access(subject) OR length(task_id)>160 OR due_date !~ '^\d{4}-\d{2}-\d{2}$' OR length(expected_date)>40 THEN RETURN jsonb_build_object('updated',false,'error','CAPABILITY_DENIED'); END IF;
 BEGIN IF to_char(due_date::date,'YYYY-MM-DD')<>due_date THEN RETURN jsonb_build_object('updated',false,'error','INVALID_DATE'); END IF; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('updated',false,'error','INVALID_DATE'); END;
 SELECT board_data INTO data FROM public.client_boards WHERE id=board_id AND archived=false FOR UPDATE;
 IF data IS NULL OR jsonb_typeof(data->'groups')<>'array' OR coalesce(data->>'name','') ~* '(article.?generation|content.?engine|echo|hermes)' THEN RETURN jsonb_build_object('updated',false,'error','TASK_UNAVAILABLE'); END IF;
 FOR g,gi IN SELECT value,(ordinality-1)::integer FROM jsonb_array_elements(data->'groups') WITH ORDINALITY LOOP
  IF jsonb_typeof(g->'tasks')<>'array' THEN CONTINUE; END IF;
  FOR t,ti IN SELECT value,(ordinality-1)::integer FROM jsonb_array_elements(g->'tasks') WITH ORDINALITY LOOP
   IF t->>'id'=task_id THEN
    matches:=matches+1;
    IF NOT coalesce(CASE jsonb_typeof(t->'assignedTo')
      WHEN 'string' THEN t->>'assignedTo'=subject::text
      WHEN 'array' THEN (t->'assignedTo') ? subject::text AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(t->'assignedTo') AS assigned(id) WHERE jsonb_typeof(id)<>'string')
      ELSE false END,false) OR coalesce(g->>'title',g->>'name','') ~* '(article|content.?engine|echo|hermes)' OR coalesce(t->>'dueDate','')<>expected_date OR t::text ~* '(article|content.?engine|echo|hermes|credential|publish|send)' THEN RETURN jsonb_build_object('updated',false,'error','TASK_UNAVAILABLE_OR_CHANGED'); END IF;
    target_path:=ARRAY['groups',gi::text,'tasks',ti::text,'dueDate'];
   END IF;
  END LOOP;
 END LOOP;
 IF matches<>1 OR target_path IS NULL THEN RETURN jsonb_build_object('updated',false,'error','TASK_UNAVAILABLE'); END IF;
 UPDATE public.client_boards SET board_data=jsonb_set(data,target_path,to_jsonb(due_date),true),updated_at=now() WHERE id=board_id;
 RETURN jsonb_build_object('updated',true,'boardId',board_id,'taskId',task_id,'dueDate',due_date,'previousDate',expected_date);
END $function$;
REVOKE ALL ON FUNCTION public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb), public.private_bot_update_task_due_date(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb), public.private_bot_update_task_due_date(uuid,uuid,text,text,text) TO service_role;
COMMIT;
