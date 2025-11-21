-- COMPLETE CHAT RESET
-- This will drop and recreate all chat-related tables from scratch

-- Drop tables in correct order (foreign keys first)
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS channels CASCADE;

-- Recreate channels table
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'channel', -- 'channel' or 'dm'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate chat_messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_ai BOOLEAN DEFAULT FALSE,
  avatar TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ
);

-- Recreate message_reactions table
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- Create indexes for better performance
CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);

-- Enable Row Level Security
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all authenticated users)
CREATE POLICY "Allow all for authenticated users" ON channels
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON chat_messages
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON message_reactions
  FOR ALL USING (auth.role() = 'authenticated');

-- Insert default channels
INSERT INTO channels (name, type) VALUES
  ('general', 'channel'),
  ('ask-ai', 'channel');

-- Success message
SELECT 'Chat tables completely reset and recreated!' AS status;
