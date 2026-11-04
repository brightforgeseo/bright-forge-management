-- Synthetic fixtures only. Run exclusively through private_bot_assignments_sql_test.py.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('11111111-1111-4111-8111-111111111111','fixture@example.invalid',now());
INSERT INTO public.private_bot_owners VALUES('11111111-1111-4111-8111-111111111111','fixture@example.invalid');
INSERT INTO public.private_bot_jobs(id,owner_id,bot_id,status,worker_id,lease_expires_at) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','running','33333333-3333-4333-8333-333333333333',now()+interval '10 minutes');
CREATE FUNCTION pg_temp.arguments(field text DEFAULT 'status') RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('board_id','55555555-5555-4555-8555-555555555555','task_id','fixture','expected',CASE WHEN field='status' THEN 'Not Started' ELSE '2026-10-20' END,'value',CASE WHEN field='status' THEN 'In Progress' ELSE '2026-10-21' END) $$;
CREATE FUNCTION pg_temp.run_operation(op text DEFAULT 'fixture-op', args jsonb DEFAULT pg_temp.arguments(), subject uuid DEFAULT '11111111-1111-4111-8111-111111111111',worker uuid DEFAULT '33333333-3333-4333-8333-333333333333') RETURNS jsonb LANGUAGE sql AS $$ SELECT public.private_bot_operation(subject,'22222222-2222-4222-8222-222222222222',worker,op,CASE WHEN args->>'value'='2026-10-21' THEN 'update_my_task_due_date' ELSE 'update_my_task_status' END,args,'begin') $$;
CREATE FUNCTION pg_temp.reset_board(assignment jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 DELETE FROM public.private_bot_operations;
 DELETE FROM public.client_boards;
 INSERT INTO public.client_boards(id,board_data) VALUES('55555555-5555-4555-8555-555555555555',jsonb_build_object('name','Fixture','groups',jsonb_build_array(jsonb_build_object('title','Ordinary work','tasks',jsonb_build_array(jsonb_build_object('id','fixture','title','Metadata audit','assignedTo',assignment,'status','Not Started','dueDate','2026-10-20'))))));
END $$;
CREATE FUNCTION pg_temp.expect_error(expected text,args jsonb DEFAULT pg_temp.arguments(),subject uuid DEFAULT '11111111-1111-4111-8111-111111111111',worker uuid DEFAULT '33333333-3333-4333-8333-333333333333') RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN PERFORM pg_temp.run_operation('fixture-op',args,subject,worker); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM<>expected THEN RAISE EXCEPTION 'wrong denial: expected %, got %',expected,SQLERRM;END IF;
 IF EXISTS(SELECT FROM public.private_bot_operations) THEN RAISE EXCEPTION 'denied operation left receipt';END IF;
 RETURN; END;
 RAISE EXCEPTION 'expected denial %',expected;
END $$;
DO $$ DECLARE a jsonb; allowed boolean; r jsonb; original jsonb; field text; checked integer:=0; BEGIN
 FOR a,allowed IN SELECT value->0,(value->>1)::boolean FROM jsonb_array_elements('[
 ["11111111-1111-4111-8111-111111111111",true],
 [["foreign","11111111-1111-4111-8111-111111111111"],true],
 [["11111111-1111-4111-8111-111111111111"],true],
 [["foreign"],false],[[],false],[null,false],[{},false],[1,false],[true,false],
 [[["11111111-1111-4111-8111-111111111111"]],false],
 [["11111111-1111-4111-8111-111111111111",{}],false],
 [["11111111-1111-4111-8111-111111111111",null],false],
 [["11111111-1111-4111-8111-111111111111",1],false],
 [["11111111-1111-4111-8111-111111111111",["foreign"]],false],
 [{"11111111-1111-4111-8111-111111111111":true},false],
 [" 11111111-1111-4111-8111-111111111111",false]
 ]'::jsonb) LOOP
 FOREACH field IN ARRAY ARRAY['status','dueDate','legacy'] LOOP
 PERFORM pg_temp.reset_board(a);SELECT board_data INTO original FROM public.client_boards;
 IF field='legacy' THEN
 r=public.private_bot_update_task_due_date('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','fixture','2026-10-20','2026-10-21');
 IF (r->>'updated'='true') IS DISTINCT FROM allowed THEN RAISE EXCEPTION 'legacy assignment % expected % got %',a,allowed,r; END IF;
 ELSIF allowed THEN
 r=pg_temp.run_operation('fixture-op',pg_temp.arguments(field));
 IF r#>>'{receipt,updated}'<>'true' THEN RAISE EXCEPTION 'operation assignment % failed %',a,r; END IF;
 IF (SELECT board_data#>>ARRAY['groups','0','tasks','0',field] FROM public.client_boards)<>pg_temp.arguments(field)->>'value' THEN RAISE EXCEPTION 'write readback failed';END IF;
 IF pg_temp.run_operation('fixture-op',pg_temp.arguments(field))->>'reused'<>'true' OR (SELECT count(*) FROM public.private_bot_operations)<>1 THEN RAISE EXCEPTION 'idempotent receipt failed'; END IF;
 ELSE PERFORM pg_temp.expect_error('TASK_UNAVAILABLE_OR_CHANGED',pg_temp.arguments(field));
 END IF;
 IF NOT allowed AND (SELECT board_data FROM public.client_boards)<>original THEN RAISE EXCEPTION 'denial mutated board'; END IF;
 checked=checked+1;
 END LOOP; END LOOP;
 RAISE NOTICE 'PASS % scalar/array/malformed assignment cases across status, due-date and legacy RPC',checked;
END $$;
DO $$ DECLARE owner_array jsonb:='["foreign","11111111-1111-4111-8111-111111111111"]'; v text; BEGIN
 PERFORM pg_temp.reset_board(owner_array);
 PERFORM pg_temp.expect_error('CAPABILITY_DENIED',pg_temp.arguments(),'99999999-9999-4999-8999-999999999999');
 PERFORM pg_temp.expect_error('STALE_JOB_LEASE',pg_temp.arguments(),'11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999');
 UPDATE public.private_bot_jobs SET lease_expires_at=now()-interval '1 second';PERFORM pg_temp.expect_error('STALE_JOB_LEASE');
 UPDATE public.private_bot_jobs SET lease_expires_at=now()+interval '10 minutes',status='completed';PERFORM pg_temp.expect_error('STALE_JOB_LEASE');
 UPDATE public.private_bot_jobs SET status='running';
 UPDATE auth.users SET email_confirmed_at=NULL;PERFORM pg_temp.expect_error('CAPABILITY_DENIED');
 UPDATE auth.users SET email_confirmed_at=now(),banned_until=now()+interval '1 hour';PERFORM pg_temp.expect_error('CAPABILITY_DENIED');
 UPDATE auth.users SET banned_until=NULL;
 PERFORM pg_temp.expect_error('TASK_UNAVAILABLE_OR_CHANGED',pg_temp.arguments()||'{"expected":"changed"}');
 PERFORM pg_temp.expect_error('INVALID_TASK_STATUS',pg_temp.arguments()||'{"value":"Published"}');
 FOREACH v IN ARRAY ARRAY['Echo administration','Article Generation','Content Engine','Hermes settings'] LOOP
 PERFORM pg_temp.reset_board(owner_array);UPDATE public.client_boards SET board_data=jsonb_set(board_data,'{name}',to_jsonb(v));PERFORM pg_temp.expect_error('TASK_UNAVAILABLE');
 END LOOP;
 PERFORM pg_temp.reset_board(owner_array);UPDATE public.client_boards SET archived=true;PERFORM pg_temp.expect_error('TASK_UNAVAILABLE');
 PERFORM pg_temp.reset_board(owner_array);UPDATE public.client_boards SET board_data=jsonb_set(board_data,'{groups,0,title}','"Hermes settings"');PERFORM pg_temp.expect_error('TASK_UNAVAILABLE_OR_CHANGED');
 PERFORM pg_temp.reset_board(owner_array);UPDATE public.client_boards SET board_data=jsonb_set(board_data,'{groups,0,tasks,0,title}','"Publish credentials"');PERFORM pg_temp.expect_error('TASK_UNAVAILABLE_OR_CHANGED');
 PERFORM pg_temp.reset_board(owner_array);UPDATE public.client_boards SET board_data=board_data#-'{groups,0,tasks,0,assignedTo}';PERFORM pg_temp.expect_error('TASK_UNAVAILABLE_OR_CHANGED');
 IF has_function_privilege('authenticated','public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb)','EXECUTE') OR has_function_privilege('anon','public.private_bot_update_task_due_date(uuid,uuid,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'browser RPC access'; END IF;
 IF NOT has_function_privilege('service_role','public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'service role grant lost'; END IF;
 RAISE NOTICE 'PASS owner, worker, lease, current eligibility, stale value, status, control-plane, archive, missing assignment and RPC privilege gates';
END $$;
