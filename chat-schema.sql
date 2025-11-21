-- =====================================================
-- COMPLETE CHAT DATABASE SCHEMA
-- Properly designed with constraints, indexes, and RLS
-- =====================================================

-- Drop existing tables in correct order
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS channels CASCADE;

-- =====================================================
-- CHANNELS TABLE
-- Stores all channels (public channels and DMs)
-- =====================================================
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('channel', 'dm')),
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure channel names are unique
  CONSTRAINT unique_channel_name UNIQUE (name)
);

-- Index for faster channel lookups
CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channels_created ON channels(created_at DESC);
CREATE INDEX idx_channels_owner ON channels(owner_id);

-- =====================================================
-- CHAT_MESSAGES TABLE
-- Stores all messages with proper foreign key constraints
-- =====================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Optional fields
  is_ai BOOLEAN NOT NULL DEFAULT FALSE,
  avatar TEXT,
  attachment_url TEXT,
  attachment_type TEXT CHECK (attachment_type IN ('image', 'file', NULL)),
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_text CHECK (LENGTH(text) > 0),
  CONSTRAINT edited_timestamp CHECK (
    (is_edited = FALSE AND edited_at IS NULL) OR
    (is_edited = TRUE AND edited_at IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX idx_messages_channel ON chat_messages(channel_id);
CREATE INDEX idx_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_messages_created ON chat_messages(created_at DESC);
CREATE INDEX idx_messages_channel_created ON chat_messages(channel_id, created_at DESC);

-- =====================================================
-- MESSAGE_REACTIONS TABLE
-- Stores emoji reactions to messages
-- =====================================================
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one user can only react with the same emoji once per message
  CONSTRAINT unique_user_emoji_per_message UNIQUE (message_id, user_id, emoji),

  -- Validate emoji is not empty
  CONSTRAINT valid_emoji CHECK (LENGTH(emoji) > 0)
);

-- Indexes for performance
CREATE INDEX idx_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_reactions_user ON message_reactions(user_id);

-- =====================================================
-- CHANNEL_MEMBERS TABLE
-- Stores membership for private channels
-- =====================================================
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one user can only be a member of a channel once
  CONSTRAINT unique_channel_member UNIQUE (channel_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- Allow all authenticated users to access chat data
-- =====================================================

-- Enable RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- Channels: Public channels visible to all, private channels only to members
CREATE POLICY "Users can view public channels and their private channels"
  ON channels FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      is_private = FALSE OR
      id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can create channels"
  ON channels FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Channel owners can update their channels"
  ON channels FOR UPDATE
  USING (auth.role() = 'authenticated' AND owner_id = auth.uid());

CREATE POLICY "Channel owners can delete their channels"
  ON channels FOR DELETE
  USING (auth.role() = 'authenticated' AND owner_id = auth.uid());

-- Messages: Only visible in channels user can access
CREATE POLICY "Users can view messages in accessible channels"
  ON chat_messages FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    channel_id IN (
      SELECT id FROM channels WHERE
        is_private = FALSE OR
        id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create messages in accessible channels"
  ON chat_messages FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND
    channel_id IN (
      SELECT id FROM channels WHERE
        is_private = FALSE OR
        id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can update their own messages"
  ON chat_messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Authenticated users can delete their own messages"
  ON chat_messages FOR DELETE
  USING (sender_id = auth.uid());

-- Reactions: Only in accessible channels
CREATE POLICY "Users can view reactions in accessible channels"
  ON message_reactions FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    message_id IN (
      SELECT id FROM chat_messages WHERE
        channel_id IN (
          SELECT id FROM channels WHERE
            is_private = FALSE OR
            id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can create reactions in accessible channels"
  ON message_reactions FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND
    message_id IN (
      SELECT id FROM chat_messages WHERE
        channel_id IN (
          SELECT id FROM channels WHERE
            is_private = FALSE OR
            id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Authenticated users can delete their own reactions"
  ON message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Channel Members: Users can view members of channels they belong to
CREATE POLICY "Users can view members of their channels"
  ON channel_members FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Channel owners can add members"
  ON channel_members FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND
    channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
  );

CREATE POLICY "Channel owners can remove members"
  ON channel_members FOR DELETE
  USING (
    auth.role() = 'authenticated' AND
    channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for channels
CREATE TRIGGER set_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger for chat_messages
CREATE TRIGGER set_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- INITIAL DATA
-- Insert default channels (public channels)
-- =====================================================

INSERT INTO channels (name, type, is_private) VALUES
  ('general', 'channel', FALSE),
  ('ask-ai', 'channel', FALSE)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT
  '✅ Chat database schema created successfully!' AS status,
  (SELECT COUNT(*) FROM channels) AS channel_count,
  (SELECT COUNT(*) FROM chat_messages) AS message_count,
  (SELECT COUNT(*) FROM message_reactions) AS reaction_count;
