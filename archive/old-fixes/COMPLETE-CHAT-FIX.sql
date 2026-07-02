-- =====================================================
-- COMPLETE CHAT FIX - RUN THIS IN SUPABASE SQL EDITOR
-- This will completely reset and fix all chat functionality
-- =====================================================

-- Step 1: Drop everything cleanly
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS channels CASCADE;

-- Step 2: Create channels table
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('channel', 'dm')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channels_created ON channels(created_at DESC);

-- Step 3: Create chat_messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT NOT NULL CHECK (LENGTH(text) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_ai BOOLEAN NOT NULL DEFAULT FALSE,
  avatar TEXT,
  attachment_url TEXT,
  attachment_type TEXT CHECK (attachment_type IN ('image', 'file', NULL)),
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  CONSTRAINT edited_timestamp CHECK (
    (is_edited = FALSE AND edited_at IS NULL) OR
    (is_edited = TRUE AND edited_at IS NOT NULL)
  )
);

CREATE INDEX idx_messages_channel ON chat_messages(channel_id);
CREATE INDEX idx_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_messages_created ON chat_messages(created_at DESC);
CREATE INDEX idx_messages_channel_created ON chat_messages(channel_id, created_at DESC);

-- Step 4: Create message_reactions table
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (LENGTH(emoji) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_emoji_per_message UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_reactions_user ON message_reactions(user_id);

-- Step 5: Enable RLS on all tables
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view all channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can create channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can update channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can delete channels" ON channels;

DROP POLICY IF EXISTS "Authenticated users can view all messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can update their own messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can delete their own messages" ON chat_messages;

DROP POLICY IF EXISTS "Authenticated users can view all reactions" ON message_reactions;
DROP POLICY IF EXISTS "Authenticated users can create reactions" ON message_reactions;
DROP POLICY IF EXISTS "Authenticated users can delete their own reactions" ON message_reactions;

-- Step 7: Create RLS policies for channels
CREATE POLICY "Authenticated users can view all channels"
  ON channels FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create channels"
  ON channels FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update channels"
  ON channels FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete channels"
  ON channels FOR DELETE
  USING (auth.role() = 'authenticated');

-- Step 8: Create RLS policies for messages
CREATE POLICY "Authenticated users can view all messages"
  ON chat_messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update their own messages"
  ON chat_messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Authenticated users can delete their own messages"
  ON chat_messages FOR DELETE
  USING (sender_id = auth.uid());

-- Step 9: Create RLS policies for reactions
CREATE POLICY "Authenticated users can view all reactions"
  ON message_reactions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create reactions"
  ON message_reactions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete their own reactions"
  ON message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Step 10: Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_channels_updated_at ON channels;
CREATE TRIGGER set_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_messages_updated_at ON chat_messages;
CREATE TRIGGER set_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Step 11: Insert default channels
INSERT INTO channels (name, type) VALUES
  ('general', 'channel'),
  ('ask-ai', 'channel')
ON CONFLICT (name) DO NOTHING;

-- Step 12: Verify setup
SELECT
  '✅ Chat database is now fixed!' AS status,
  (SELECT COUNT(*) FROM channels) AS channel_count,
  (SELECT COUNT(*) FROM chat_messages) AS message_count,
  (SELECT COUNT(*) FROM message_reactions) AS reaction_count;
