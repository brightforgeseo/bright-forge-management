-- =============================================
-- CHAT TO-DO / REMINDERS TABLE
-- Run this in Supabase SQL Editor
-- =============================================

-- Create the chat_todos table
CREATE TABLE IF NOT EXISTS chat_todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  client_board_id TEXT,          -- References board_data.id in client_boards (not a FK since it's JSONB)
  client_board_name TEXT,        -- Cached client name for display
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT 'Unknown',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_todos_created_at ON chat_todos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_todos_is_completed ON chat_todos(is_completed);
CREATE INDEX IF NOT EXISTS idx_chat_todos_client_board_id ON chat_todos(client_board_id);

-- Enable RLS
ALTER TABLE chat_todos ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read, insert, update, delete
CREATE POLICY "chat_todos_select" ON chat_todos FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_todos_insert" ON chat_todos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "chat_todos_update" ON chat_todos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_todos_delete" ON chat_todos FOR DELETE TO authenticated USING (true);

-- Enable realtime
ALTER TABLE chat_todos REPLICA IDENTITY FULL;

-- Add to realtime publication (if not already a member)
-- Note: If this errors with "already a member", that's fine - it means realtime is already enabled
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_todos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
