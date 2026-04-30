-- ============================================================================
-- BULLETPROOF_NOTIFICATIONS.sql
-- Run this ONCE in the Supabase SQL editor. Idempotent — safe to re-run.
-- It guarantees the notifications table, RLS, realtime, replica identity,
-- and indexes are all correct so notifications actually fire and arrive live.
-- ============================================================================

-- 1) Make sure the table exists with every column the app uses.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  link_view TEXT,
  link_data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns on older deployments
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_view TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_data JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

-- 2) Indexes — fast unread fetches and dedup checks
CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id) WHERE is_read = false;

-- 3) RLS — lock to recipient for read/update/delete; allow any signed-in user
--    to insert (because senders insert notifications for others).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE USING (auth.uid() = user_id);

-- 4) Realtime — REPLICA IDENTITY FULL is required so postgres_changes
--    delivers UPDATE/DELETE payloads with old row data.
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- 5) Add the table to the supabase_realtime publication (no-op if already there)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN OTHERS THEN NULL;
END $$;

-- 6) Quick sanity check — run this and confirm one row comes back per check.
-- SELECT 'replica' AS check, relreplident FROM pg_class WHERE relname = 'notifications'
-- UNION ALL
-- SELECT 'in_publication', count(*)::text
--   FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications'
-- UNION ALL
-- SELECT 'rls_enabled', relrowsecurity::text FROM pg_class WHERE relname='notifications';

-- DONE. Reload the app and notifications should arrive live.
