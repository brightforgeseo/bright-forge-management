-- ========================================
-- PRESENCE HEARTBEAT FALLBACK
-- Run this in the Supabase SQL Editor
-- ========================================
-- Online badges normally come from Supabase Realtime presence (websocket).
-- When the websocket is blocked by the hosting proxy, the portal falls back
-- to writing a heartbeat to profiles.last_seen_at every 30 seconds and
-- treating anyone seen in the last 90 seconds as online. This migration adds
-- the column that fallback needs.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Index so the poll stays cheap as the team grows
CREATE INDEX IF NOT EXISTS profiles_last_seen_idx ON profiles(last_seen_at DESC);

-- Make sure users are allowed to update their own profile row (no-op if a
-- permissive update policy already exists from COMPLETE_FIX.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "Users can update own profile" ON profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'last_seen_at';
