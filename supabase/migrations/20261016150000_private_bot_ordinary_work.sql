-- Bounded ordinary work only. All browser roles denied; broker derives subject.
CREATE OR REPLACE FUNCTION public.private_bot_update_task_due_date(subject uuid,board_id uuid,task_id text,expected_date text,due_date text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
    IF coalesce(t->>'assignedTo','')<>subject::text OR coalesce(jsonb_typeof(t->'assignedTo'),'null')<>'string' OR coalesce(g->>'title',g->>'name','') ~* '(article|content.?engine|echo|hermes)' OR coalesce(t->>'dueDate','')<>expected_date OR t::text ~* '(article|content.?engine|echo|hermes|credential|publish|send)' THEN RETURN jsonb_build_object('updated',false,'error','TASK_UNAVAILABLE_OR_CHANGED'); END IF;
    target_path:=ARRAY['groups',gi::text,'tasks',ti::text,'dueDate'];
   END IF;
  END LOOP;
 END LOOP;
 IF matches<>1 OR target_path IS NULL THEN RETURN jsonb_build_object('updated',false,'error','TASK_UNAVAILABLE'); END IF;
 UPDATE public.client_boards SET board_data=jsonb_set(data,target_path,to_jsonb(due_date),true),updated_at=now() WHERE id=board_id;
 RETURN jsonb_build_object('updated',true,'boardId',board_id,'taskId',task_id,'dueDate',due_date,'previousDate',expected_date);
END $$;
REVOKE ALL ON FUNCTION public.private_bot_update_task_due_date(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_bot_update_task_due_date(uuid,uuid,text,text,text) TO service_role;
