BEGIN;
DO $$ BEGIN IF to_regclass('public.private_bot_artifacts') IS NULL THEN RAISE EXCEPTION 'private agent output persistence missing';END IF;END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1e57188-a322-42b2-9d33-b5df08033685',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private_bot_artifacts WHERE owner_id<>auth.uid()) THEN RAISE EXCEPTION 'cross-owner output disclosed';END IF;
 BEGIN INSERT INTO private_bot_artifacts(owner_id,bot_id,job_id,name,format,content) VALUES(auth.uid(),gen_random_uuid(),gen_random_uuid(),'forged.txt','txt','forged');RAISE EXCEPTION 'direct output mutation allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
