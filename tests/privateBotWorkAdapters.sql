BEGIN;
INSERT INTO public.client_boards(id,board_data) VALUES ('c2f10000-0000-4000-8000-000000000001','{"name":"QA private bot ordinary due date fixture","groups":[{"id":"qa","tasks":[{"id":"qa-due","title":"QA technical audit","assignedTo":"a1e57188-a322-42b2-9d33-b5df08033685","dueDate":"2026-10-20"},{"id":"qa-article","title":"Article Generation","assignedTo":"a1e57188-a322-42b2-9d33-b5df08033685","dueDate":"2026-10-20"}]}]}');
DO $$ DECLARE r jsonb; BEGIN
r:=public.private_bot_update_task_due_date('a1e57188-a322-42b2-9d33-b5df08033685','c2f10000-0000-4000-8000-000000000001','qa-due','2026-10-20','2026-10-21');
IF r->>'updated'<>'true' THEN RAISE EXCEPTION 'own update failed %',r; END IF;
IF (SELECT board_data#>>'{groups,0,tasks,0,dueDate}' FROM public.client_boards WHERE id='c2f10000-0000-4000-8000-000000000001')<>'2026-10-21' THEN RAISE EXCEPTION 'write readback failed'; END IF;
r:=public.private_bot_update_task_due_date('942055eb-54f6-426a-8194-b81ab83669f6','c2f10000-0000-4000-8000-000000000001','qa-due','2026-10-21','2026-10-22'); IF r->>'updated'='true' THEN RAISE EXCEPTION 'cross assignment allowed'; END IF;
r:=public.private_bot_update_task_due_date('a1e57188-a322-42b2-9d33-b5df08033685','c2f10000-0000-4000-8000-000000000001','qa-due','2026-10-20','2026-10-22'); IF r->>'updated'='true' THEN RAISE EXCEPTION 'stale write allowed'; END IF;
r:=public.private_bot_update_task_due_date('a1e57188-a322-42b2-9d33-b5df08033685','c2f10000-0000-4000-8000-000000000001','qa-article','2026-10-20','2026-10-22'); IF r->>'updated'='true' THEN RAISE EXCEPTION 'article write allowed'; END IF;
IF has_function_privilege('authenticated','public.private_bot_update_task_due_date(uuid,uuid,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'browser RPC permission'; END IF;
END $$;
ROLLBACK;
