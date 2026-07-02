-- ========================================
-- FULL-TEXT MESSAGE SEARCH
-- Run this in the Supabase SQL Editor
-- ========================================
-- Adds a Postgres full-text index to chat_messages so search stays fast as
-- history grows and supports word-based matching ("meeting notes" finds
-- "notes from the meeting"). The app automatically uses this when present
-- and falls back to substring search when it isn't.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS text_search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_chat_messages_text_search
  ON chat_messages USING GIN (text_search);

SELECT 'full-text search ready' AS status;
