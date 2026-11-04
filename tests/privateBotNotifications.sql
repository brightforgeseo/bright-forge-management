-- NEVER run against production. Requires disposable DB with existing migration test fixtures.
BEGIN;
DO $$ BEGIN IF current_database()  IS DISTINCT FROM  'private_bot_notification_test' THEN RAISE EXCEPTION 'isolated database required'; END IF; END $$;
DO $$
DECLARE owner uuid:='a1e57188-a322-42b2-9d33-b5df08033685'; bot uuid; j jsonb; again jsonb; c jsonb; gen uuid; rejected boolean:=false;
BEGIN
 SELECT id INTO STRICT bot FROM public.private_bots WHERE owner_id=owner AND slot=1;
 INSERT INTO public.private_bot_telegram_bindings(owner_id,telegram_user_id) VALUES(owner,'999990001') ON CONFLICT(owner_id) DO UPDATE SET telegram_user_id=excluded.telegram_user_id;
 j:=public.private_bot_telegram_enqueue(owner,bot,'999990001','91',0,'fixture');
 again:=public.private_bot_telegram_enqueue(owner,bot,'999990001','91',0,'fixture');
 IF j->>'id' IS DISTINCT FROM again->>'id' THEN RAISE EXCEPTION 'duplicate enqueue'; END IF;
 UPDATE public.private_bot_jobs SET status='completed',response='persisted result' WHERE id=(j->>'id')::uuid;
 -- Browser-supplied Telegram-like request key must never acquire a subscription.
 PERFORM public.private_bot_enqueue(owner,bot,'telegram:999990001:92:0',jsonb_build_object('message','fixture','identity','{}'::jsonb));
 UPDATE public.private_bot_jobs SET status='completed' WHERE request_key='telegram:999990001:92:0';
 BEGIN PERFORM public.private_bot_telegram_enqueue(owner,bot,'999990001','92',0,'fixture'); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='UNTRUSTED_REQUEST_COLLISION'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Portal collision was trusted'; END IF;
 UPDATE public.private_bot_jobs SET status='completed',response='persisted result' WHERE id=(j->>'id')::uuid;
 c:=public.private_bot_notification('claim','{}');
 IF c->>'job_id' IS DISTINCT FROM j->>'id' OR c->>'response' IS DISTINCT FROM 'persisted result' THEN RAISE EXCEPTION 'claim mismatch'; END IF;
 IF public.private_bot_notification('validate',c)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'validation failed'; END IF;
 IF public.private_bot_notification('ack',c||'{"receipt":"101"}'::jsonb)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ack failed'; END IF;
 IF public.private_bot_notification('ack',c||'{"receipt":"101"}'::jsonb)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ack not idempotent'; END IF;
 IF public.private_bot_notification('claim','{}') IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'delivered replayed'; END IF;
 j:=public.private_bot_telegram_enqueue(owner,bot,'999990001','93',0,'uncertain fixture');
 UPDATE public.private_bot_jobs SET status='completed' WHERE id=(j->>'id')::uuid;
 c:=public.private_bot_notification('claim','{}');
 UPDATE public.private_bot_notifications SET lease_until=now()-interval '1 second' WHERE job_id=(j->>'id')::uuid;
 PERFORM public.private_bot_notification('claim','{}');
 IF (SELECT state FROM public.private_bot_notifications WHERE job_id=(j->>'id')::uuid) IS DISTINCT FROM 'uncertain' THEN RAISE EXCEPTION 'stale lease replay'; END IF;
 j:=public.private_bot_telegram_enqueue(owner,bot,'999990001','94',0,'revoked fixture');
 UPDATE public.private_bot_jobs SET status='completed' WHERE id=(j->>'id')::uuid;
 c:=public.private_bot_notification('claim','{}');
 SELECT generation INTO gen FROM public.private_bot_telegram_bindings WHERE owner_id=owner;
 UPDATE public.private_bot_telegram_bindings SET telegram_user_id=telegram_user_id WHERE owner_id=owner;
 IF gen=(SELECT generation FROM public.private_bot_telegram_bindings WHERE owner_id=owner) THEN RAISE EXCEPTION 'generation did not rotate'; END IF;
 IF public.private_bot_notification('validate',c) IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'revoked generation delivered'; END IF;
END $$;
DO $$ DECLARE owner uuid:='a1e57188-a322-42b2-9d33-b5df08033685'; bot uuid; foreign_bot uuid; denied boolean:=false;
BEGIN
 SELECT id INTO bot FROM private_bots WHERE owner_id=owner AND slot=1;
 SELECT id INTO foreign_bot FROM private_bots WHERE owner_id<>owner AND slot=1 LIMIT 1;
 BEGIN PERFORM private_bot_telegram_enqueue(owner,foreign_bot,'999990001','201',0,'fixture'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='CAPABILITY_DENIED'; END;
 IF NOT denied THEN RAISE EXCEPTION 'foreign bot accepted'; END IF;
 denied:=false;
 BEGIN PERFORM private_bot_telegram_enqueue(owner,bot,'999990999','201',0,'fixture'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='CAPABILITY_DENIED'; END;
 IF NOT denied THEN RAISE EXCEPTION 'foreign Telegram accepted'; END IF;
 denied:=false;
 BEGIN PERFORM private_bot_telegram_enqueue(owner,bot,'999990001',NULL,0,'fixture'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='CAPABILITY_DENIED'; END;
 IF NOT denied THEN RAISE EXCEPTION 'null transport accepted'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM private_bot_notification('claim','{}'); RAISE EXCEPTION 'browser claim accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM private_bot_notifications; RAISE EXCEPTION 'browser outbox exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
