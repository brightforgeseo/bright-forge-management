-- Fix chat message deletion policy to allow Owners to delete any message
-- Users can still delete their own messages

-- Drop existing delete policy
DROP POLICY IF EXISTS "Authenticated users can delete their own messages" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete_policy" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can delete messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON chat_messages;

-- Create new delete policy that allows:
-- 1. Users to delete their own messages
-- 2. Owners to delete any message
CREATE POLICY "Users can delete own messages, Owners can delete any"
  ON chat_messages FOR DELETE
  USING (
    auth.uid() = sender_id  -- Users can delete their own messages
    OR
    EXISTS (  -- OR user is an Owner
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'Owner'
    )
  );
