BEGIN;
ALTER TABLE public.private_bot_jobs ADD COLUMN tool_trace jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(tool_trace)='array');
ALTER TABLE public.private_bot_jobs ADD CONSTRAINT private_bot_job_owner_binding UNIQUE(id,bot_id,owner_id);
CREATE TABLE public.private_bot_artifacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,bot_id uuid NOT NULL,job_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 110),format text NOT NULL CHECK(format IN ('md','csv','json','txt')),
 content text NOT NULL CHECK(length(content)<=60000),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(job_id,bot_id,owner_id) REFERENCES public.private_bot_jobs(id,bot_id,owner_id)
);
ALTER TABLE public.private_bot_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_bot_artifacts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.private_bot_artifacts TO authenticated;
GRANT ALL ON public.private_bot_artifacts TO service_role;
CREATE POLICY private_bot_artifacts_owned_read ON public.private_bot_artifacts FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.private_bot_access(auth.uid()));
COMMIT;
