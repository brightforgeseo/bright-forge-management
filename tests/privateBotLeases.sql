BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.claim_private_bot_job(uuid)') IS NULL THEN RAISE EXCEPTION 'globally bounded private claims missing'; END IF;
END $$;
INSERT INTO private_bot_jobs(bot_id,owner_id,message) SELECT id,owner_id,'QA lease fixture, transaction rolled back' FROM private_bots WHERE slot=10;
DO $$ DECLARE first_id uuid; second_id uuid; n integer;
BEGIN
 SELECT id INTO first_id FROM claim_private_bot_job('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 SELECT id INTO second_id FROM claim_private_bot_job('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 SELECT count(*) INTO n FROM claim_private_bot_job('ffffffff-ffff-4fff-8fff-ffffffffffff');
 IF first_id IS NULL OR second_id IS NULL OR first_id=second_id OR n<>0 THEN RAISE EXCEPTION 'global two-slot bound failed'; END IF;
 UPDATE private_bot_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=first_id;
 PERFORM * FROM claim_private_bot_job('ffffffff-ffff-4fff-8fff-ffffffffffff');
 IF NOT EXISTS(SELECT 1 FROM private_bot_jobs WHERE id=first_id AND status='failed' AND error_code='WORKER_LEASE_EXPIRED') THEN RAISE EXCEPTION 'expired lease did not become retryable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private_bot_jobs WHERE id=second_id AND status='running') THEN RAISE EXCEPTION 'other live worker interrupted'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
 PERFORM * FROM public.claim_private_bot_job('ffffffff-ffff-4fff-8fff-ffffffffffff');
 RAISE EXCEPTION 'browser claim permission widened';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;
