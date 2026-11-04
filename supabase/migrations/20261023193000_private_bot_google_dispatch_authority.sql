-- Read-only, service-only atomic authority snapshot for native original dispatch.
-- No tokens, no browser grants, no row changes, no synthetic production fixtures.
CREATE OR REPLACE FUNCTION public.private_bot_google_dispatch_authority(subject uuid,job_id uuid,bot uuid,worker uuid,board uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'requesterAllowed',public.private_bot_access(subject),
  'jobAllowed',EXISTS(SELECT 1 FROM public.private_bot_jobs j WHERE j.id=job_id AND j.owner_id=subject AND j.bot_id=bot AND j.worker_id=worker AND j.status='running' AND j.lease_expires_at>statement_timestamp()+interval '30 seconds'),
  'board',(SELECT jsonb_build_object('id',b.id,'archived',b.archived,'board_data',b.board_data) FROM public.client_boards b WHERE b.id=board AND b.archived=false)
 );
$$;
REVOKE ALL ON FUNCTION public.private_bot_google_dispatch_authority(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_bot_google_dispatch_authority(uuid,uuid,uuid,uuid,uuid) TO service_role;
