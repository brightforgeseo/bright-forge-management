-- Run inside a transaction, then ROLLBACK. No real Auth account mutations.
CREATE TEMP TABLE qa_auth_users AS SELECT id,email,email_confirmed_at,deleted_at,banned_until FROM auth.users WHERE id IN (SELECT owner_id FROM public.private_bot_owners);
CREATE TEMP TABLE qa_bot_owners AS SELECT * FROM public.private_bot_owners;
DO $$ DECLARE def text; BEGIN
 def=pg_get_functiondef('public.private_bot_access(uuid)'::regprocedure);
 def=replace(replace(def,'auth.users','pg_temp.qa_auth_users'),'public.private_bot_owners','pg_temp.qa_bot_owners');EXECUTE def;
END $$;
DO $$ DECLARE o record; original record; BEGIN
 FOR o IN SELECT * FROM qa_bot_owners LOOP
  SELECT * INTO original FROM qa_auth_users WHERE id=o.owner_id;
  IF NOT public.private_bot_access(o.owner_id) THEN RAISE EXCEPTION 'confirmed denied'; END IF;
  UPDATE qa_auth_users SET email_confirmed_at=null WHERE id=o.owner_id;
  IF public.private_bot_access(o.owner_id) THEN RAISE EXCEPTION 'unconfirmed allowed'; END IF;
  UPDATE qa_auth_users SET email_confirmed_at=original.email_confirmed_at,email='changed@example.invalid' WHERE id=o.owner_id;
  IF public.private_bot_access(o.owner_id) THEN RAISE EXCEPTION 'email change allowed'; END IF;
  UPDATE qa_auth_users SET email=original.email,banned_until=now()+interval '1 day' WHERE id=o.owner_id;
  IF public.private_bot_access(o.owner_id) THEN RAISE EXCEPTION 'ban allowed'; END IF;
  UPDATE qa_auth_users SET banned_until=null,deleted_at=now() WHERE id=o.owner_id;
  IF public.private_bot_access(o.owner_id) THEN RAISE EXCEPTION 'deleted allowed'; END IF;
  UPDATE qa_auth_users SET deleted_at=null WHERE id=o.owner_id;
 END LOOP;
 RAISE NOTICE 'PASS PostgreSQL identity predicate for all four confirmed/unconfirmed/email-change/banned/deleted fixtures';
END $$;
GRANT SELECT ON qa_auth_users,qa_bot_owners TO authenticated;
SELECT set_config('request.jwt.claim.sub','a1e57188-a322-42b2-9d33-b5df08033685',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.private_bots)<>10 THEN RAISE EXCEPTION 'confirmed RLS count'; END IF;END $$;
RESET ROLE;
UPDATE qa_auth_users SET email_confirmed_at=null WHERE id='a1e57188-a322-42b2-9d33-b5df08033685';
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.private_bots)<>0 THEN RAISE EXCEPTION 'unconfirmed RLS leak'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF (public.issue_private_bot_telegram_link('a1e57188-a322-42b2-9d33-b5df08033685',repeat('a',64))->>'id') IS NOT NULL THEN RAISE EXCEPTION 'unconfirmed Telegram issuance'; END IF;
 RAISE NOTICE 'PASS actual RLS and Telegram issue predicate wiring';
END $$;
