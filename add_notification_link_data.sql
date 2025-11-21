-- Add link_data column to notifications table
-- Run this in your Supabase SQL Editor

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_data JSONB;

-- Create an index for better performance when querying by link_data
CREATE INDEX IF NOT EXISTS notifications_link_data_idx ON notifications USING gin(link_data);

-- Verify the change
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;
