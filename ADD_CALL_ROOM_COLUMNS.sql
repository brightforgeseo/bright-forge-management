-- Add call room columns to chat_messages table for voice/video call functionality
-- Run this in Supabase SQL Editor

-- Add call_room_id column to store the room ID for joining calls
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS call_room_id TEXT;

-- Add call_type column to distinguish between video and voice calls
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS call_type TEXT CHECK (call_type IN ('video', 'voice'));

-- Add an index for faster lookups of active calls (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_chat_messages_call_room_id
ON chat_messages(call_room_id)
WHERE call_room_id IS NOT NULL;
