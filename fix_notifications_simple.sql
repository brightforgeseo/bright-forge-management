-- SIMPLE FIX for Notifications Table
-- Copy and paste this entire block into your Supabase SQL Editor

-- Step 1: Add the missing column
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS link_data JSONB;

-- Step 2: Verify it worked
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- You should see 'link_data' with type 'jsonb' in the results
