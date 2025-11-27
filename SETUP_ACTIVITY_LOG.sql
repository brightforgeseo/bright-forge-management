-- Activity Log Setup for Bright Forge Portal
-- Run this in your Supabase SQL Editor to enable activity tracking

-- Step 1: Create the activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Who made the change
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,

  -- What was changed
  action TEXT NOT NULL,  -- 'status_change', 'task_create', 'task_delete', 'task_archive', 'assignment_change', etc.
  entity_type TEXT NOT NULL,  -- 'task', 'board', 'channel', 'user', etc.
  entity_id TEXT,  -- ID of the task, board, etc.
  entity_name TEXT,  -- Name/title for display

  -- Change details
  field_name TEXT,  -- Which field changed (e.g., 'status', 'assignedTo', 'dueDate')
  old_value TEXT,
  new_value TEXT,

  -- Context
  board_id TEXT,
  board_name TEXT,
  group_id TEXT,
  group_name TEXT,

  -- Metadata
  metadata JSONB,  -- Additional context as needed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Create indexes for faster queries
CREATE INDEX IF NOT EXISTS activity_log_user_id_idx ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS activity_log_entity_type_idx ON activity_log(entity_type);
CREATE INDEX IF NOT EXISTS activity_log_action_idx ON activity_log(action);
CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_board_id_idx ON activity_log(board_id);

-- Step 3: Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies
-- Only Owners can view the full activity log
-- Regular users can only see their own activity
CREATE POLICY "Owners can view all activity" ON activity_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM allowed_users
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND role = 'Owner'
    )
  );

CREATE POLICY "Users can view their own activity" ON activity_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone authenticated can insert activity logs
CREATE POLICY "Authenticated users can create activity logs" ON activity_log
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Step 5: Enable realtime for activity_log (optional - for live updates)
ALTER TABLE activity_log REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Done! Activity logging is now set up.
