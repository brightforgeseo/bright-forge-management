BEGIN;
DO $$ BEGIN IF to_regclass('public.private_bot_telegram_links') IS NULL THEN RAISE EXCEPTION 'secure Telegram linking missing'; END IF; END $$;
INSERT INTO private_bot_telegram_links(id,owner_id,code_hash) VALUES('11111111-1111-4111-8111-111111111111','a1e57188-a322-42b2-9d33-b5df08033685','fixture-digest');
DO $$ DECLARE result jsonb; n integer;
BEGIN
 result:=claim_private_bot_telegram_link('fixture-digest','999990001');IF result->>'pending'<>'true' THEN RAISE EXCEPTION 'claim failed';END IF;
 result:=claim_private_bot_telegram_link('fixture-digest','999990001');IF result->>'error' IS NULL THEN RAISE EXCEPTION 'replay accepted';END IF;
 IF approve_private_bot_telegram_link('942055eb-54f6-426a-8194-b81ab83669f6','11111111-1111-4111-8111-111111111111','999990001') THEN RAISE EXCEPTION 'cross-owner approval accepted';END IF;
 IF approve_private_bot_telegram_link('a1e57188-a322-42b2-9d33-b5df08033685','11111111-1111-4111-8111-111111111111','999990002') THEN RAISE EXCEPTION 'forged Telegram identity accepted';END IF;
 IF NOT approve_private_bot_telegram_link('a1e57188-a322-42b2-9d33-b5df08033685','11111111-1111-4111-8111-111111111111','999990001') THEN RAISE EXCEPTION 'same-owner approval failed';END IF;
 IF approve_private_bot_telegram_link('a1e57188-a322-42b2-9d33-b5df08033685','11111111-1111-4111-8111-111111111111','999990001') THEN RAISE EXCEPTION 'approval replay accepted';END IF;
 FOR n IN 1..6 LOOP result:=claim_private_bot_telegram_link('unknown','999990003');END LOOP;
 IF result->>'error'<>'rate limited' THEN RAISE EXCEPTION 'claim rate bound failed';END IF;
END $$;
INSERT INTO private_bot_telegram_links(id,owner_id,code_hash,expires_at) VALUES('22222222-2222-4222-8222-222222222222','942055eb-54f6-426a-8194-b81ab83669f6','expired',now()-interval '1 second');
DO $$ DECLARE result jsonb; n integer; BEGIN
 IF (claim_private_bot_telegram_link('expired','999990004'))->>'error' IS NULL THEN RAISE EXCEPTION 'expired claim accepted';END IF;
 UPDATE private_bot_telegram_links SET claimed_at=now(),telegram_user_id='999990004' WHERE id='22222222-2222-4222-8222-222222222222';
 IF approve_private_bot_telegram_link('942055eb-54f6-426a-8194-b81ab83669f6','22222222-2222-4222-8222-222222222222','999990004') THEN RAISE EXCEPTION 'expired approval accepted';END IF;
 FOR n IN 1..4 LOOP result:=issue_private_bot_telegram_link('01b597e9-43f0-4363-9ced-8b2613b1bbab','rate-fixture-'||n);END LOOP;
 IF result->>'error'<>'rate limited' THEN RAISE EXCEPTION 'issuance rate bound failed';END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.private_bot_telegram_bindings; RAISE EXCEPTION 'direct bindings read accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.claim_private_bot_telegram_link('fixture-digest','999990001');RAISE EXCEPTION 'direct browser claim accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
