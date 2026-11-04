DO $$
DECLARE owner uuid:='a1e57188-a322-42b2-9d33-b5df08033685'; bot uuid; j jsonb; again jsonb; jid uuid; w uuid:=gen_random_uuid(); r jsonb; r2 jsonb; denied boolean; args jsonb; beforecount bigint;
BEGIN
 SELECT id INTO bot FROM public.private_bots WHERE owner_id=owner AND slot=8;
 j=public.private_bot_enqueue(owner,bot,'qa-receipt-test-1','{"message":"Controlled administrative QA"}');jid=(j->>'id')::uuid;
 again=public.private_bot_enqueue(owner,bot,'qa-receipt-test-1','{"message":"Controlled administrative QA"}');
 IF again->>'id'<>j->>'id' THEN RAISE EXCEPTION 'duplicate enqueue'; END IF;
 denied=false;BEGIN PERFORM public.private_bot_enqueue(owner,bot,'qa-receipt-test-1','{"message":"changed"}');EXCEPTION WHEN OTHERS THEN denied=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'request collision accepted'; END IF;
 UPDATE public.private_bot_jobs SET status='running',worker_id=w,lease_expires_at=now()+interval '5 minutes' WHERE id=jid;
 args='{"name":"qa.csv","format":"csv","content":"label,value\nformula,\u0027=1+1\n"}';
 r=public.private_bot_operation(owner,jid,w,'save-1','save_output',args,'begin');
 -- Response loss after committed write: replay before trace persistence.
 r2=public.private_bot_operation(owner,jid,w,'save-1','save_output',args,'begin');
 IF r->'receipt'<>r2->'receipt' OR (SELECT count(*) FROM public.private_bot_artifacts WHERE job_id=jid)<>1 THEN RAISE EXCEPTION 'replay duplicated effect'; END IF;
 denied=false;BEGIN PERFORM public.private_bot_operation('942055eb-54f6-426a-8194-b81ab83669f6',jid,w,'save-2','save_output',args,'begin');EXCEPTION WHEN OTHERS THEN denied=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'foreign write allowed'; END IF;
 denied=false;BEGIN PERFORM public.private_bot_operation(owner,jid,gen_random_uuid(),'save-2','save_output',args,'begin');EXCEPTION WHEN OTHERS THEN denied=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'wrong worker allowed'; END IF;
 PERFORM public.private_bot_operation(owner,jid,w,'provider-1','provider_execution','{}','begin');
 denied=false;BEGIN PERFORM public.private_bot_operation(owner,jid,w,'provider-1','provider_execution','{}','begin');EXCEPTION WHEN OTHERS THEN denied=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'uncertain paid replay allowed'; END IF;
 INSERT INTO public.client_boards(id,board_data) VALUES('c2f10000-0000-4000-8000-000000000099','{"name":"Private QA ordinary work fixture","groups":[{"id":"qa","tasks":[{"id":"qa-status","title":"Inspect metadata","assignedTo":"a1e57188-a322-42b2-9d33-b5df08033685","status":"Not Started"}]}]}');
 args='{"board_id":"c2f10000-0000-4000-8000-000000000099","task_id":"qa-status","expected":"Not Started","value":"In Progress"}';
 r=public.private_bot_operation(owner,jid,w,'task-1','update_my_task_status',args,'begin');
 r2=public.private_bot_operation(owner,jid,w,'task-1','update_my_task_status',args,'begin');
 IF r->'receipt'<>r2->'receipt' OR (SELECT board_data#>>'{groups,0,tasks,0,status}' FROM public.client_boards WHERE id='c2f10000-0000-4000-8000-000000000099')<>'In Progress' THEN RAISE EXCEPTION 'task readback/replay failed'; END IF;
 UPDATE public.private_bot_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=jid;
 denied=false;BEGIN PERFORM public.private_bot_operation(owner,jid,w,'save-expired','save_output','{}','begin');EXCEPTION WHEN OTHERS THEN denied=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'expired write allowed'; END IF;
 denied=false;BEGIN PERFORM public.private_bot_operation(owner,jid,w,'provider-1','provider_execution','{}','finish','{}');EXCEPTION WHEN OTHERS THEN denied=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'late callback allowed'; END IF;
 IF public.private_bot_finish(owner,jid,w,'completed','late',null) THEN RAISE EXCEPTION 'late completion allowed'; END IF;
 IF has_function_privilege('authenticated','public.private_bot_operation(uuid,uuid,uuid,text,text,jsonb,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'browser mutation allowed';END IF;
 RAISE NOTICE 'PASS duplicate delivery, collision, one-effect replay, cross-owner, worker, uncertain provider, ordinary status readback, expired lease, late callback and privilege checks';
END $$;
