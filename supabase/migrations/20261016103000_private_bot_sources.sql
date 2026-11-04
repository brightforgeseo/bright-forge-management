BEGIN;
ALTER TABLE public.private_bot_jobs ADD COLUMN reference_text text NOT NULL DEFAULT '' CHECK(length(reference_text)<=16000);
COMMIT;
