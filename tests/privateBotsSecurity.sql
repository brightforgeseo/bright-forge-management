-- Transactional security probe. All fixture edits are rolled back.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.private_bots') IS NULL THEN RAISE EXCEPTION 'private bot persistence missing'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1e57188-a322-42b2-9d33-b5df08033685', true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.private_bots) <> 10 THEN RAISE EXCEPTION 'Jani must see exactly ten own bots'; END IF;
 IF EXISTS (SELECT 1 FROM public.private_bots WHERE owner_id <> auth.uid()) THEN RAISE EXCEPTION 'cross owner disclosure'; END IF;
 IF EXISTS (SELECT 1 FROM public.private_bot_jobs WHERE owner_id <> auth.uid()) THEN RAISE EXCEPTION 'cross owner job disclosure'; END IF;
 BEGIN
   UPDATE public.private_bots SET owner_id='f9f11222-d2a9-4ae8-a327-8c4621d90b7c' WHERE owner_id=auth.uid();
   RAISE EXCEPTION 'owner mutation unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.private_bot_jobs(bot_id,owner_id,message) SELECT id,auth.uid(),'fixture forbidden' FROM public.private_bots LIMIT 1;
   RAISE EXCEPTION 'direct job write unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='a1e57188-a322-42b2-9d33-b5df08033685';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.private_bots) THEN RAISE EXCEPTION 'banned user saw bots'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.private_bots) THEN RAISE EXCEPTION 'unknown user saw bots'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
