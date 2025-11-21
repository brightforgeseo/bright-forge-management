-- Reset Chat Tables
-- Run this in Supabase SQL Editor to clear all chat data and start fresh

-- Delete all message reactions first (foreign key constraint)
DELETE FROM message_reactions;

-- Delete all chat messages
DELETE FROM chat_messages;

-- Delete all channels except the default ones
DELETE FROM channels WHERE name NOT IN ('general', 'ask-ai');

-- Reset the default channels to ensure they exist
INSERT INTO channels (name, type, created_at)
VALUES
  ('general', 'channel', NOW()),
  ('ask-ai', 'channel', NOW())
ON CONFLICT (name) DO NOTHING;

-- Success message
SELECT 'Chat reset complete! All messages and custom channels deleted.' AS status;
