-- Migration: Add message threading/reply support to chat_messages table
-- Run this in Supabase SQL Editor

-- Add parent_message_id column (references another message for threading)
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Add reply_count column to track number of replies to a message
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0;

-- Create partial index for faster queries on parent messages
-- Only indexes messages that are replies (have a parent_message_id)
CREATE INDEX IF NOT EXISTS idx_messages_parent ON chat_messages(parent_message_id)
WHERE parent_message_id IS NOT NULL;

-- Create index for faster lookup of messages by channel excluding replies (for main chat view)
CREATE INDEX IF NOT EXISTS idx_messages_channel_no_replies ON chat_messages(channel_id, created_at)
WHERE parent_message_id IS NULL;
