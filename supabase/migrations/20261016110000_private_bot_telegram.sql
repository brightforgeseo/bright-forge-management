-- Telegram uses the same private_bots/private_bot_jobs records, no separate history.
BEGIN;
CREATE TABLE public.private_bot_telegram_bindings(owner_id uuid PRIMARY KEY REFERENCES public.private_bot_owners(owner_id), telegram_user_id text NOT NULL UNIQUE CHECK(telegram_user_id ~ '^[1-9][0-9]{4,19}$'), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.private_bot_telegram_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.private_bot_owners(owner_id),code_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',telegram_user_id text,claimed_at timestamptz,approved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.private_bot_telegram_limits(telegram_user_id text PRIMARY KEY,window_start timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0);
ALTER TABLE public.private_bot_telegram_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_bot_telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_bot_telegram_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_bot_telegram_bindings,public.private_bot_telegram_links,public.private_bot_telegram_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.private_bot_telegram_bindings,public.private_bot_telegram_links,public.private_bot_telegram_limits TO service_role;
CREATE FUNCTION public.issue_private_bot_telegram_link(subject uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE new_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(81401641);
 IF NOT public.private_bot_access(subject) THEN RETURN jsonb_build_object('error','owner unavailable'); END IF;
 IF (SELECT count(*) FROM public.private_bot_telegram_links WHERE owner_id=subject AND created_at>now()-interval '10 minutes')>=3 THEN RETURN jsonb_build_object('error','rate limited');END IF;
 UPDATE public.private_bot_telegram_links SET expires_at=now() WHERE owner_id=subject AND approved_at IS NULL;
 INSERT INTO public.private_bot_telegram_links(owner_id,code_hash) VALUES(subject,digest) RETURNING id INTO new_id;
 RETURN jsonb_build_object('id',new_id);
END $$;
REVOKE ALL ON FUNCTION public.issue_private_bot_telegram_link(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_private_bot_telegram_link(uuid,text) TO service_role;
CREATE FUNCTION public.claim_private_bot_telegram_link(digest text,telegram_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.private_bot_telegram_links; count_attempts integer;
BEGIN
 IF telegram_id !~ '^[1-9][0-9]{4,19}$' THEN RETURN jsonb_build_object('error','invalid identity'); END IF;
 INSERT INTO public.private_bot_telegram_limits(telegram_user_id,attempts) VALUES(telegram_id,1)
 ON CONFLICT(telegram_user_id) DO UPDATE SET
 attempts=CASE WHEN private_bot_telegram_limits.window_start<now()-interval '10 minutes' THEN 1 ELSE private_bot_telegram_limits.attempts+1 END,
 window_start=CASE WHEN private_bot_telegram_limits.window_start<now()-interval '10 minutes' THEN now() ELSE private_bot_telegram_limits.window_start END
 RETURNING attempts INTO count_attempts;
 IF count_attempts>5 THEN RETURN jsonb_build_object('error','rate limited'); END IF;
 SELECT * INTO row FROM public.private_bot_telegram_links WHERE code_hash=digest FOR UPDATE;
 IF row.id IS NULL OR row.expires_at<=now() OR row.claimed_at IS NOT NULL OR NOT public.private_bot_access(row.owner_id) THEN RETURN jsonb_build_object('error','invalid or expired code'); END IF;
 IF EXISTS(SELECT 1 FROM public.private_bot_telegram_bindings WHERE telegram_user_id=telegram_id AND owner_id<>row.owner_id) THEN RETURN jsonb_build_object('error','identity already linked'); END IF;
 UPDATE public.private_bot_telegram_links SET telegram_user_id=telegram_id,claimed_at=now() WHERE id=row.id;
 RETURN jsonb_build_object('pending',true);
END $$;
CREATE FUNCTION public.approve_private_bot_telegram_link(subject uuid,link_id uuid,telegram_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.private_bot_telegram_links;
BEGIN
 IF NOT public.private_bot_access(subject) THEN RETURN false; END IF;
 SELECT * INTO row FROM public.private_bot_telegram_links WHERE id=link_id AND owner_id=subject FOR UPDATE;
 IF row.id IS NULL OR row.expires_at<=now() OR row.claimed_at IS NULL OR row.approved_at IS NOT NULL OR row.telegram_user_id<>telegram_id THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.private_bot_telegram_bindings WHERE telegram_user_id=telegram_id AND owner_id<>subject) THEN RETURN false; END IF;
 INSERT INTO public.private_bot_telegram_bindings(owner_id,telegram_user_id) VALUES(subject,telegram_id) ON CONFLICT(owner_id) DO UPDATE SET telegram_user_id=excluded.telegram_user_id;
 UPDATE public.private_bot_telegram_links SET approved_at=now(),code_hash=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex') WHERE id=row.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_private_bot_telegram_link(text,text),public.approve_private_bot_telegram_link(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_bot_telegram_link(text,text),public.approve_private_bot_telegram_link(uuid,uuid,text) TO service_role;
-- Ben's numeric identity was supplied by the authenticated current Telegram session
-- and cross-checked against 28 matching local Telegram sessions. Staff are not seeded.
INSERT INTO public.private_bot_telegram_bindings(owner_id,telegram_user_id) VALUES('f9f11222-d2a9-4ae8-a327-8c4621d90b7c','7887803972');
COMMIT;
