-- ========================================
-- ADD MESSAGE REACTIONS TABLE
-- Run this in Supabase SQL Editor
-- ========================================

-- Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one user can only react with same emoji once per message
  UNIQUE(message_id, user_id, emoji)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);

-- Enable Row Level Security
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read reactions
CREATE POLICY "Anyone can read reactions"
  ON message_reactions FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can add reactions
CREATE POLICY "Authenticated users can add reactions"
  ON message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
  ON message_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Verify table was created
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'message_reactions'
ORDER BY ordinal_position;

-- Test query structure
SELECT
  'Table structure verified' as status,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'message_reactions';
