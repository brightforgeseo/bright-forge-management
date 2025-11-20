-- ========================================
-- ADD MESSAGE EDITING AND AVATAR COLUMNS
-- Run this in Supabase SQL Editor
-- ========================================

-- Add new columns to chat_messages table for message editing
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS sender_id UUID,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- Create index on sender_id for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'chat_messages'
  AND column_name IN ('sender_id', 'is_edited', 'edited_at')
ORDER BY column_name;

-- Show a sample of the table structure
SELECT
  id,
  channel_id,
  sender,
  sender_id,
  text,
  is_edited,
  edited_at,
  created_at
FROM chat_messages
LIMIT 1;
