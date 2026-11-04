-- F07: current confirmed email required for API-equivalent RLS/RPC/Telegram access.
-- No owner, Auth user, bot, history or binding records are modified.
BEGIN;
CREATE OR REPLACE FUNCTION public.private_bot_access(subject uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.private_bot_owners o JOIN auth.users u ON u.id=o.owner_id
 WHERE o.owner_id=subject AND u.email=o.email AND u.deleted_at IS NULL
 AND u.email_confirmed_at IS NOT NULL AND u.email_confirmed_at<=now()
 AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
REVOKE ALL ON FUNCTION public.private_bot_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_bot_access(uuid) TO authenticated,service_role;
COMMIT;
