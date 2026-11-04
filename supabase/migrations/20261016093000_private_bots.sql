-- Private Portal workspaces. No changes to existing Echo/article permissions.
BEGIN;
CREATE TABLE public.private_bot_owners (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id),
 email text NOT NULL UNIQUE,
 CHECK ((owner_id,email) IN (
 ('f9f11222-d2a9-4ae8-a327-8c4621d90b7c'::uuid,'bensocialbeesmedia@gmail.com'),
 ('a1e57188-a322-42b2-9d33-b5df08033685'::uuid,'janincanonero@gmail.com'),
 ('942055eb-54f6-426a-8194-b81ab83669f6'::uuid,'dee.tan@ama.edu.ph'),
 ('01b597e9-43f0-4363-9ced-8b2613b1bbab'::uuid,'nazardinfarhanw@gmail.com')))
);
INSERT INTO public.private_bot_owners VALUES
 ('f9f11222-d2a9-4ae8-a327-8c4621d90b7c','bensocialbeesmedia@gmail.com'),
 ('a1e57188-a322-42b2-9d33-b5df08033685','janincanonero@gmail.com'),
 ('942055eb-54f6-426a-8194-b81ab83669f6','dee.tan@ama.edu.ph'),
 ('01b597e9-43f0-4363-9ced-8b2613b1bbab','nazardinfarhanw@gmail.com');
CREATE TABLE public.private_bots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.private_bot_owners(owner_id),
 slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 10),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=6000),
 context text NOT NULL DEFAULT '' CHECK(length(context)<=24000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,slot), UNIQUE(id,owner_id)
);
CREATE TABLE public.private_bot_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bot_id uuid NOT NULL, owner_id uuid NOT NULL,
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 12000),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=6000),
 context text NOT NULL DEFAULT '' CHECK(length(context)<=24000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
 response text, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
 FOREIGN KEY(bot_id,owner_id) REFERENCES public.private_bots(id,owner_id)
);
CREATE INDEX private_bot_jobs_history ON public.private_bot_jobs(bot_id,created_at);
CREATE UNIQUE INDEX private_bot_one_active ON public.private_bot_jobs(bot_id) WHERE status IN ('pending','running');
-- Lookup is deliberately narrow and checks Auth on every RLS read, including existing JWTs.
CREATE FUNCTION public.private_bot_access(subject uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.private_bot_owners o JOIN auth.users u ON u.id=o.owner_id
 WHERE o.owner_id=subject AND u.email=o.email AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
REVOKE ALL ON FUNCTION public.private_bot_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_bot_access(uuid) TO authenticated,service_role;
ALTER TABLE public.private_bot_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_bot_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_bot_owners,public.private_bots,public.private_bot_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.private_bots,public.private_bot_jobs TO authenticated;
GRANT ALL ON public.private_bot_owners,public.private_bots,public.private_bot_jobs TO service_role;
CREATE POLICY private_bots_owned_read ON public.private_bots FOR SELECT TO authenticated
 USING(owner_id=auth.uid() AND public.private_bot_access(auth.uid()));
CREATE POLICY private_jobs_owned_read ON public.private_bot_jobs FOR SELECT TO authenticated
 USING(owner_id=auth.uid() AND public.private_bot_access(auth.uid()));
-- Existing records are never replaced. Unique slots make the fixed quota structural.
INSERT INTO public.private_bots(owner_id,slot,name)
 SELECT owner_id,slot,'Bot'||slot FROM public.private_bot_owners CROSS JOIN generate_series(1,10) slot
 ON CONFLICT(owner_id,slot) DO NOTHING;
COMMIT;
