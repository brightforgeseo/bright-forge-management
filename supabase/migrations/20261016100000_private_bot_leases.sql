BEGIN;
ALTER TABLE public.private_bot_jobs ADD COLUMN worker_id uuid, ADD COLUMN lease_expires_at timestamptz;
-- A single transaction-wide lock coordinates the global two-slot private model pool.
-- Only the protected server can claim or recover jobs, never browser RPC callers.
CREATE FUNCTION public.claim_private_bot_job(worker_name uuid) RETURNS SETOF public.private_bot_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(81401640);
 UPDATE public.private_bot_jobs SET status='failed',error_code='WORKER_LEASE_EXPIRED',finished_at=now()
 WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<now());
 IF (SELECT count(*) FROM public.private_bot_jobs WHERE status='running')>=2 THEN RETURN; END IF;
 SELECT id INTO target FROM public.private_bot_jobs WHERE status='pending' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF target IS NOT NULL THEN
 RETURN QUERY UPDATE public.private_bot_jobs SET status='running',worker_id=worker_name,
 started_at=now(),lease_expires_at=now()+interval '300 seconds' WHERE id=target AND status='pending' RETURNING *;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_private_bot_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_bot_job(uuid) TO service_role;
COMMIT;
