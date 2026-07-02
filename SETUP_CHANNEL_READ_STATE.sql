-- ========================================
-- PERSISTENT UNREAD STATE
-- Run this in the Supabase SQL Editor
-- ========================================
-- Stores per-user "last read" markers per channel so unread badges survive
-- page reloads and logins instead of living only in browser memory.
-- A channel starts accumulating unread counts after the first time the user
-- opens it (which creates their read-state row).

CREATE TABLE IF NOT EXISTS channel_read_state (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

ALTER TABLE channel_read_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own read-state" ON channel_read_state;
CREATE POLICY "read own read-state" ON channel_read_state
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "insert own read-state" ON channel_read_state;
CREATE POLICY "insert own read-state" ON channel_read_state
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "update own read-state" ON channel_read_state;
CREATE POLICY "update own read-state" ON channel_read_state
  FOR UPDATE USING (true);

-- Unread counts per channel for a user, based on their read markers.
CREATE OR REPLACE FUNCTION get_unread_counts(p_user UUID)
RETURNS TABLE(channel_id UUID, unread BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT m.channel_id, COUNT(*) AS unread
  FROM chat_messages m
  JOIN channel_read_state r
    ON r.channel_id = m.channel_id AND r.user_id = p_user
  WHERE m.sender_id <> p_user
    AND m.is_ai = FALSE
    AND m.created_at > r.last_read_at
  GROUP BY m.channel_id;
$$;

GRANT EXECUTE ON FUNCTION get_unread_counts(UUID) TO authenticated, anon;

-- Index that keeps the count query fast
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON chat_messages(channel_id, created_at DESC);

SELECT 'channel_read_state ready' AS status;
