-- Simple Chat Reset - Matches existing code exactly
-- Just clears data, doesn't change structure

-- Clear all data
TRUNCATE TABLE message_reactions CASCADE;
TRUNCATE TABLE chat_messages CASCADE;
TRUNCATE TABLE channels CASCADE;

-- Recreate default channels
INSERT INTO channels (name, type, created_at) VALUES
  ('general', 'channel', NOW()),
  ('ask-ai', 'channel', NOW());

SELECT 'Chat reset complete. All data cleared, default channels recreated.' AS status;
