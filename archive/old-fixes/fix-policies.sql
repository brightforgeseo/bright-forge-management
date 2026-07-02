-- Fix RLS policies - run this NOW in Supabase SQL Editor

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can view all channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can create channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can update channels" ON channels;
DROP POLICY IF EXISTS "Authenticated users can delete channels" ON channels;
DROP POLICY IF EXISTS "Users can view public channels and their private channels" ON channels;
DROP POLICY IF EXISTS "Channel owners can update their channels" ON channels;
DROP POLICY IF EXISTS "Channel owners can delete their channels" ON channels;

DROP POLICY IF EXISTS "Authenticated users can view all messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can view messages in accessible channels" ON chat_messages;
DROP POLICY IF EXISTS "Users can create messages in accessible channels" ON chat_messages;

DROP POLICY IF EXISTS "Authenticated users can view all reactions" ON message_reactions;
DROP POLICY IF EXISTS "Authenticated users can create reactions" ON message_reactions;
DROP POLICY IF EXISTS "Users can view reactions in accessible channels" ON message_reactions;
DROP POLICY IF EXISTS "Users can create reactions in accessible channels" ON message_reactions;

DROP POLICY IF EXISTS "Users can view members of their channels" ON channel_members;
DROP POLICY IF EXISTS "Channel owners can add members" ON channel_members;
DROP POLICY IF EXISTS "Channel owners can remove members" ON channel_members;

-- Create new policies for channels
CREATE POLICY "view_channels" ON channels FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    is_private = FALSE OR
    id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "create_channels" ON channels FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "update_channels" ON channels FOR UPDATE
  USING (auth.role() = 'authenticated' AND (owner_id = auth.uid() OR owner_id IS NULL));

CREATE POLICY "delete_channels" ON channels FOR DELETE
  USING (auth.role() = 'authenticated' AND (owner_id = auth.uid() OR owner_id IS NULL));

-- Create new policies for messages
CREATE POLICY "view_messages" ON chat_messages FOR SELECT USING (
  auth.role() = 'authenticated' AND
  channel_id IN (
    SELECT id FROM channels WHERE
      is_private = FALSE OR
      id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "create_messages" ON chat_messages FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND
  channel_id IN (
    SELECT id FROM channels WHERE
      is_private = FALSE OR
      id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "update_own_messages" ON chat_messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "delete_own_messages" ON chat_messages FOR DELETE
  USING (sender_id = auth.uid());

-- Create new policies for reactions
CREATE POLICY "view_reactions" ON message_reactions FOR SELECT USING (
  auth.role() = 'authenticated'
);

CREATE POLICY "create_reactions" ON message_reactions FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

CREATE POLICY "delete_own_reactions" ON message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Create policies for channel_members
CREATE POLICY "view_members" ON channel_members FOR SELECT USING (
  auth.role() = 'authenticated' AND
  channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
);

CREATE POLICY "add_members" ON channel_members FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND
  channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
);

CREATE POLICY "remove_members" ON channel_members FOR DELETE USING (
  auth.role() = 'authenticated' AND
  channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
);

SELECT 'Policies fixed!' as status;
