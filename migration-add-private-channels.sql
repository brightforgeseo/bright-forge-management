-- =====================================================
-- MIGRATION: Add Private Channels Feature
-- This script adds private channel functionality without losing existing data
-- =====================================================

-- Step 1: Add new columns to channels table
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Step 2: Create index for owner_id
CREATE INDEX IF NOT EXISTS idx_channels_owner ON channels(owner_id);

-- Step 3: Create channel_members table
CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one user can only be a member of a channel once
  CONSTRAINT unique_channel_member UNIQUE (channel_id, user_id)
);

-- Step 4: Create indexes for channel_members
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

-- Step 5: Enable RLS on channel_members
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop old RLS policies on channels
DROP POLICY IF EXISTS "Authenticated users can view all channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can create channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can update channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can delete channels" ON channels;

-- Step 7: Create new RLS policies for channels (with private channel support)
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

-- Step 8: Update message policies to respect private channels
DROP POLICY IF EXISTS "Authenticated users can view all messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can view messages in accessible channels" ON chat_messages;
DROP POLICY IF EXISTS "Users can create messages in accessible channels" ON chat_messages;

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

-- Step 9: Update reaction policies to respect private channels
DROP POLICY IF EXISTS "Authenticated users can view all reactions" ON message_reactions;
DROP POLICY IF EXISTS "Authenticated users can create reactions" ON message_reactions;
DROP POLICY IF EXISTS "Users can view reactions in accessible channels" ON message_reactions;
DROP POLICY IF EXISTS "Users can create reactions in accessible channels" ON message_reactions;

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

-- Step 10: Create RLS policies for channel_members
DROP POLICY IF EXISTS "Users can view members of their channels" ON channel_members;
DROP POLICY IF EXISTS "Channel owners can add members" ON channel_members;
DROP POLICY IF EXISTS "Channel owners can remove members" ON channel_members;

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
-- VERIFICATION
-- =====================================================

SELECT
  '✅ Migration completed successfully!' AS status,
  (SELECT COUNT(*) FROM channels) AS channel_count,
  (SELECT COUNT(*) FROM channel_members) AS member_count,
  (SELECT COUNT(*) FROM chat_messages) AS message_count;
