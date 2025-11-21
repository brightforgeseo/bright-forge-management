-- Add link_data column to notifications table
-- Run this in your Supabase SQL Editor

-- Add the column if it doesn't exist
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_data JSONB;

-- Create an index for better performance when querying by link_data
-- Use jsonb_path_ops for JSONB columns
CREATE INDEX IF NOT EXISTS notifications_link_data_idx ON notifications USING gin(link_data jsonb_path_ops);

-- Verify the change
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;
