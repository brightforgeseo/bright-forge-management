-- ========================================
-- CLIENT ERROR LOGGING
-- Run this in the Supabase SQL Editor
-- ========================================
-- The portal reports crashes and unhandled errors here so you can see what
-- broke (and for whom) without waiting for screenshots. Check it with:
--   SELECT created_at, message, url, user_id FROM error_logs
--   ORDER BY created_at DESC LIMIT 50;

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  stack TEXT,
  source TEXT,
  url TEXT,
  user_agent TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can report errors" ON error_logs;
CREATE POLICY "anyone can report errors" ON error_logs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "team can read errors" ON error_logs;
CREATE POLICY "team can read errors" ON error_logs
  FOR SELECT USING (true);

SELECT 'error_logs ready' AS status;
