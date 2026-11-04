-- Review-only coordinated release. Transaction must be supplied by the migrator.
-- Source writes are the trusted event route, including old packaged clients.
-- No browser recipient/title/message RPC. Never grants service credentials.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA notification_private;
REVOKE ALL ON SCHEMA notification_private FROM PUBLIC, anon, authenticated;
CREATE TABLE notification_private.principals (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  can_admin boolean NOT NULL DEFAULT false
);
-- One-time reviewed roster snapshot, not a runtime trust in mutable profiles.
-- Subsequent onboarding/offboarding is server-only; never grant this to browsers.
INSERT INTO notification_private.principals(user_id,display_name)
SELECT u.id,coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id=u.id LIMIT 1),'Team member')
FROM auth.users u WHERE u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
AND (u.banned_until IS NULL OR u.banned_until < now());
-- Existing server-controlled Ben owner binding from businessOsModel.mjs.
-- Editable renderer profile roles never grant notification administration.
UPDATE notification_private.principals SET can_admin=true
WHERE user_id='f9f11222-d2a9-4ae8-a327-8c4621d90b7c';
CREATE TABLE notification_private.deliveries (
  event_key text NOT NULL, user_id uuid NOT NULL, notification_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_key,user_id)
);
REVOKE ALL ON ALL TABLES IN SCHEMA notification_private FROM PUBLIC,anon,authenticated;

CREATE FUNCTION notification_private.active(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM notification_private.principals p JOIN auth.users u ON u.id=p.user_id
 WHERE p.user_id=uid AND p.enabled AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until < now()));
$$;
CREATE FUNCTION notification_private.server_actor() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT coalesce(auth.role()='service_role',false) OR
 (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')
 AND coalesce(current_setting('role',true),'none') IN ('none','postgres','supabase_admin'));
$$;
CREATE FUNCTION notification_private.dm_ids(n text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE WHEN n ~ '^dm_[0-9a-f-]{36}_[0-9a-f-]{36}$' THEN string_to_array(substr(n,4),'_') ELSE ARRAY[]::text[] END;
$$;
CREATE FUNCTION notification_private.channel_access(cid uuid,uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT notification_private.active(uid) AND EXISTS(SELECT 1 FROM public.channels c WHERE c.id=cid AND
 CASE WHEN c.type='dm' THEN uid::text=ANY(notification_private.dm_ids(c.name))
 ELSE NOT coalesce(c.is_private,false) OR c.owner_id=uid OR EXISTS
 (SELECT 1 FROM public.channel_members m WHERE m.channel_id=c.id AND m.user_id=uid) END);
$$;
CREATE FUNCTION notification_private.emit(k text,uid uuid,title text,body text,kind text,view_name text,link jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE nid uuid := gen_random_uuid();
BEGIN
 IF NOT notification_private.active(uid) THEN RETURN; END IF;
 INSERT INTO notification_private.deliveries(event_key,user_id,notification_id) VALUES(k,uid,nid) ON CONFLICT DO NOTHING;
 IF FOUND THEN
  INSERT INTO public.notifications(id,user_id,title,message,type,link_view,link_data,is_read)
  VALUES(nid,uid,title,body,kind,view_name,link::text,false);
 END IF;
END $$;
CREATE FUNCTION notification_private.chat_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); c public.channels; p record; actor_name text; title text; shared record; link jsonb;
BEGIN
 IF NOT notification_private.server_actor() THEN
  IF actor IS NULL OR NEW.sender_id IS DISTINCT FROM actor OR NOT notification_private.channel_access(NEW.channel_id,actor) THEN
   RAISE EXCEPTION 'not authorised to produce chat notifications' USING ERRCODE='42501';
  END IF;
 ELSE actor := NEW.sender_id;
 END IF;
 SELECT * INTO c FROM public.channels WHERE id=NEW.channel_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT display_name INTO actor_name FROM notification_private.principals WHERE user_id=actor;
 actor_name := coalesce(actor_name,'Echo');
 -- A task-link payload is only a locator. Resolve its title and deep link from
 -- the actual board, and retain the channel audience boundary for private shares.
 SELECT br.id AS board_db_id,notification_private.object(br.board_data) AS board,t.task,t.group_data INTO shared
 FROM public.client_boards br CROSS JOIN LATERAL notification_private.tasks(br.board_data) t
 WHERE NOT coalesce(br.archived,false) AND notification_private.object(br.board_data)->>'id'=NEW.task_link->>'boardId'
 AND t.task->>'id'=NEW.task_link->>'taskId' AND t.group_data->>'id'=NEW.task_link->>'groupId' LIMIT 1;
 FOR p IN SELECT user_id,display_name FROM notification_private.principals
 WHERE user_id IS DISTINCT FROM actor AND notification_private.channel_access(c.id,user_id) LOOP
  title := CASE WHEN c.type='dm' THEN 'New Direct Message'
    WHEN position(lower('@'||p.display_name) in lower(coalesce(NEW.text,'')))>0 THEN actor_name||' mentioned you in #'||c.name
    ELSE 'New message in #'||c.name END;
  link := jsonb_build_object('channelId',c.id,'channelName',c.name,'channelType',c.type,'messageId',NEW.id);
  IF shared.task IS NOT NULL THEN
   PERFORM notification_private.emit('chat:'||NEW.id::text,p.user_id,actor_name||' shared a task',
    '"'||coalesce(shared.task->>'title','Task')||'" in #'||c.name,'message','TASKS',link||
    jsonb_build_object('taskId',shared.task->>'id','boardId',shared.board->>'id','boardDbId',shared.board_db_id,'groupId',shared.group_data->>'id'));
  ELSE
   PERFORM notification_private.emit('chat:'||NEW.id::text,p.user_id,title,
    actor_name||': '||left(coalesce(NEW.text,''),100),'message','TEAM_CHAT',link);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_chat_insert AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION notification_private.chat_insert();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA notification_private FROM PUBLIC,anon,authenticated;

-- Source protection is required: these tables originally had no RLS.
-- Prevent browser mutation of the authorisation facts used by the producer.
CREATE FUNCTION notification_private.source_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); c public.channels; admin boolean;
BEGIN
 IF notification_private.server_actor() THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF NOT notification_private.active(actor) THEN RAISE EXCEPTION 'not authorised: portal principal required' USING ERRCODE='42501'; END IF;
 SELECT can_admin INTO admin FROM notification_private.principals WHERE user_id=actor;
 IF TG_TABLE_NAME='channels' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.type='dm' AND NOT actor::text=ANY(notification_private.dm_ids(NEW.name)) THEN
    RAISE EXCEPTION 'not authorised: DM participants' USING ERRCODE='42501';
   END IF;
   NEW.owner_id := actor;
  ELSE
   IF NOT admin AND OLD.owner_id IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'not authorised: channel owner required' USING ERRCODE='42501';
   END IF;
   IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.type IS DISTINCT FROM OLD.type OR (OLD.type='dm' AND NEW.name IS DISTINCT FROM OLD.name)) THEN
    RAISE EXCEPTION 'not authorised: immutable channel identity' USING ERRCODE='42501';
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='channel_members' THEN
  IF TG_OP='DELETE' THEN SELECT * INTO c FROM public.channels WHERE id=OLD.channel_id;
  ELSE SELECT * INTO c FROM public.channels WHERE id=NEW.channel_id; END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.channel_id IS DISTINCT FROM OLD.channel_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
   RAISE EXCEPTION 'not authorised: immutable membership' USING ERRCODE='42501';
  END IF;
  IF c.id IS NULL OR (NOT admin AND c.owner_id IS DISTINCT FROM actor AND NOT
   (TG_OP='DELETE' AND OLD.user_id=actor) AND NOT
   (TG_OP='INSERT' AND NEW.user_id=actor AND notification_private.channel_access(c.id,actor))) THEN
   RAISE EXCEPTION 'not authorised: channel invitation' USING ERRCODE='42501';
  END IF;
  IF TG_OP<>'DELETE' THEN NEW.invited_by := actor; NEW.role := CASE WHEN c.owner_id=NEW.user_id THEN 'owner' ELSE 'member' END; END IF;
 ELSIF TG_TABLE_NAME='chat_messages' THEN
  -- Insert is checked again at the producer boundary. Updates must not move
  -- another person's historical event or forge an author for later replay.
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.channel_id IS DISTINCT FROM OLD.channel_id) THEN
   RAISE EXCEPTION 'not authorised: immutable message identity' USING ERRCODE='42501';
  END IF;
  IF TG_OP<>'INSERT' AND NOT notification_private.channel_access(OLD.channel_id,actor) THEN
   RAISE EXCEPTION 'not authorised: channel access' USING ERRCODE='42501';
  END IF;
 ELSIF TG_TABLE_NAME='client_boards' THEN
  -- Current portal boards are team-shared. Rights come from the protected
  -- principal roster, never profiles.role or caller-supplied authors.
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'not authorised: immutable board identity' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER notification_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.channels
FOR EACH ROW EXECUTE FUNCTION notification_private.source_guard();
CREATE TRIGGER notification_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.channel_members
FOR EACH ROW EXECUTE FUNCTION notification_private.source_guard();
CREATE TRIGGER notification_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION notification_private.source_guard();
CREATE TRIGGER notification_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.client_boards
FOR EACH ROW EXECUTE FUNCTION notification_private.source_guard();
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.channels,public.channel_members,public.chat_messages,public.client_boards FROM PUBLIC,anon;
REVOKE TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.channels,public.channel_members,public.chat_messages,public.client_boards FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA notification_private FROM PUBLIC,anon,authenticated;

CREATE FUNCTION notification_private.object(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(v)='string' THEN RETURN (v#>>'{}')::jsonb; END IF;
 RETURN coalesce(v,'{}'::jsonb);
EXCEPTION WHEN invalid_text_representation THEN RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION notification_private.items(v jsonb) RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v)='array' THEN v ELSE '[]'::jsonb END);
$$;
CREATE FUNCTION notification_private.ids(v jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(v)='string' THEN ARRAY[v#>>'{}']
 ELSE ARRAY(SELECT value#>>'{}' FROM notification_private.items(v) value) END;
$$;
CREATE FUNCTION notification_private.tasks(v jsonb) RETURNS TABLE(group_data jsonb,task jsonb)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT g,t FROM notification_private.items(notification_private.object(v)->'groups') g
 CROSS JOIN LATERAL notification_private.items(g->'tasks') t;
$$;
CREATE FUNCTION notification_private.board_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); actor_name text; b jsonb := notification_private.object(NEW.board_data);
 prev jsonb; row record; old_task jsonb; c jsonb; old_c jsonb; p record; link jsonb; last_author text;
 event_id text := gen_random_uuid()::text;
BEGIN
 IF NOT notification_private.server_actor() AND NOT notification_private.active(actor) THEN
  RAISE EXCEPTION 'not authorised: board notification actor' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN prev := notification_private.object(OLD.board_data); END IF;
 SELECT display_name INTO actor_name FROM notification_private.principals WHERE user_id=actor;
 actor_name := coalesce(actor_name,'Echo');
 FOR row IN SELECT * FROM notification_private.tasks(b) LOOP
  SELECT task INTO old_task FROM notification_private.tasks(prev)
   WHERE task->>'id'=row.task->>'id' AND group_data->>'id'=row.group_data->>'id' LIMIT 1;
  -- Moving a uniquely identified task is not a new assignment. Never pick an
  -- arbitrary same-ID task from another group when the board contains collisions.
  IF old_task IS NULL AND (SELECT count(*) FROM notification_private.tasks(prev) WHERE task->>'id'=row.task->>'id')=1 THEN
   SELECT task INTO old_task FROM notification_private.tasks(prev) WHERE task->>'id'=row.task->>'id';
  END IF;
  link := jsonb_build_object('boardId',b->>'id','boardDbId',NEW.id,'boardName',b->>'name',
    'groupId',row.group_data->>'id','taskId',row.task->>'id');
  IF NOT coalesce(NEW.archived,false) THEN
   FOR p IN SELECT user_id FROM notification_private.principals WHERE user_id IS DISTINCT FROM actor
    AND user_id::text=ANY(notification_private.ids(row.task->'assignedTo'))
    AND NOT user_id::text=ANY(notification_private.ids(old_task->'assignedTo')) LOOP
    PERFORM notification_private.emit('assignment:'||NEW.id::text||':'||(row.group_data->>'id')||':'||(row.task->>'id')||':'||event_id,
     p.user_id,actor_name||' assigned you a task','"'||coalesce(row.task->>'title','Task')||'" on '||coalesce(b->>'name','Board'),
     'message','TASKS',link);
   END LOOP;
  END IF;
  FOR c IN SELECT * FROM notification_private.items(row.task->'comments') LOOP
   SELECT value INTO old_c FROM notification_private.items(old_task->'comments') value WHERE value->>'id'=c->>'id' LIMIT 1;
   IF old_c IS NOT NULL THEN
    IF NOT notification_private.server_actor() AND old_c->>'authorId' IS DISTINCT FROM c->>'authorId' THEN
     RAISE EXCEPTION 'not authorised: immutable comment author' USING ERRCODE='42501';
    END IF;
    CONTINUE;
   END IF;
   IF NOT notification_private.server_actor() AND nullif(c->>'authorId','') IS NOT NULL AND c->>'authorId' IS DISTINCT FROM actor::text THEN
    RAISE EXCEPTION 'not authorised: comment author' USING ERRCODE='42501';
   END IF;
   -- Legacy comments without an authorId are attributed to the authenticated
   -- writer, not the free-text author field. Stable comment ID is mandatory.
   IF nullif(c->>'id','') IS NULL THEN CONTINUE; END IF;
   SELECT value->>'authorId' INTO last_author FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(old_task->'comments')='array' THEN old_task->'comments' ELSE '[]'::jsonb END)
    WITH ORDINALITY AS prior(value,n) WHERE value->>'authorId' IS DISTINCT FROM actor::text ORDER BY n DESC LIMIT 1;
   FOR p IN SELECT user_id FROM notification_private.principals WHERE user_id IS DISTINCT FROM actor AND
    (user_id::text=ANY(notification_private.ids(row.task->'assignedTo'))
    OR user_id::text=ANY(notification_private.ids(c->'mentions')) OR user_id::text=last_author) LOOP
    PERFORM notification_private.emit('comment:'||NEW.id::text||':'||(row.group_data->>'id')||':'||(row.task->>'id')||':'||(c->>'id'),p.user_id,
     CASE WHEN p.user_id::text=ANY(notification_private.ids(c->'mentions')) THEN actor_name||' mentioned you'
     WHEN p.user_id::text=last_author THEN actor_name||' replied to you'
     ELSE 'New comment on "'||coalesce(row.task->>'title','Task')||'"' END,
     actor_name||': '||left(coalesce(c->>'text',''),100),'message','TASKS',link||jsonb_build_object('commentId',c->>'id'));
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_board_change AFTER INSERT OR UPDATE OF board_data ON public.client_boards
FOR EACH ROW EXECUTE FUNCTION notification_private.board_change();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA notification_private FROM PUBLIC,anon,authenticated;

-- Authenticated event endpoint: POST /rest/v1/rpc/produce_due_notifications {}.
-- No recipient, clock, author, task text or arbitrary notification input.
CREATE FUNCTION public.produce_due_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); today date := (now() AT TIME ZONE 'Australia/Perth')::date;
 br record; row record; b jsonb; due date; days integer; status jsonb; p record; title text; body text;
BEGIN
 IF NOT notification_private.server_actor() AND NOT notification_private.active(actor) THEN
  RAISE EXCEPTION 'not authorised: reminder actor' USING ERRCODE='42501';
 END IF;
 FOR br IN SELECT id,board_data FROM public.client_boards WHERE NOT coalesce(archived,false) LOOP
  b := notification_private.object(br.board_data);
  FOR row IN SELECT * FROM notification_private.tasks(b) LOOP
   IF NOT notification_private.server_actor() AND NOT actor::text=ANY(notification_private.ids(row.task->'assignedTo')) THEN CONTINUE; END IF;
   IF coalesce(row.task->>'archived','false')='true' OR coalesce(row.task->>'isArchived','false')='true'
    OR lower(coalesce(row.group_data->>'title','')) ~ '(done|complete|archived)' THEN CONTINUE; END IF;
   SELECT v INTO status FROM notification_private.items(b->'statusDefs') v WHERE v->>'id'=row.task->>'status' LIMIT 1;
   IF lower(coalesce(status->>'label',row.task->>'status','')) ~ '(done|complete|finished|closed|approved|shipped|delivered|resolved|sent to client|ben to check|archived)'
    OR lower(coalesce(status->>'color',''))=ANY(ARRAY['#00c875','#00ca72','#22c55e','#16a34a','#15803d','#166534','#4ade80','#86efac','green']) THEN CONTINUE; END IF;
   IF coalesce(row.task->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$' THEN CONTINUE; END IF;
   BEGIN due := (row.task->>'dueDate')::date; EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN CONTINUE; END;
   days := today-due;
   IF days=0 THEN title := 'Task Due Today'; body := 'due today';
   ELSIF days IN (-3,-1) THEN title := 'Upcoming Task'; body := CASE WHEN days=-1 THEN 'due tomorrow' ELSE 'due in 3 days' END;
   ELSIF days=1 OR (days>=7 AND days%7=0) THEN title := 'Overdue Task'; body := days::text||CASE WHEN days=1 THEN ' day overdue' ELSE ' days overdue' END;
   ELSE CONTINUE; END IF;
   FOR p IN SELECT user_id FROM notification_private.principals WHERE user_id::text=ANY(notification_private.ids(row.task->'assignedTo')) LOOP
    PERFORM notification_private.emit('due:'||br.id::text||':'||(row.group_data->>'id')||':'||(row.task->>'id')||':'||today::text,p.user_id,
     title,'"'||coalesce(row.task->>'title','Task')||'" is '||body||' on '||coalesce(b->>'name','Board'),'alert','TASKS',
     jsonb_build_object('taskId',row.task->>'id','boardId',b->>'id','boardDbId',br.id,'groupId',row.group_data->>'id'));
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.produce_due_notifications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.produce_due_notifications() TO authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA notification_private FROM PUBLIC,anon,authenticated;
