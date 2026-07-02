-- ================================================
-- NOTIFICATION TABLE FIX - 100% WORKING VERSION
-- ================================================
-- Copy this ENTIRE block into Supabase SQL Editor and run it

-- Step 1: Check if column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'link_data'
    ) THEN
        -- Add the column
        ALTER TABLE notifications ADD COLUMN link_data JSONB;
        RAISE NOTICE 'Column link_data added successfully';
    ELSE
        RAISE NOTICE 'Column link_data already exists';
    END IF;
END $$;

-- Step 2: Verify the table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
ORDER BY ordinal_position;

-- You should see these columns:
-- id, user_id, title, message, type, link_view, link_data, is_read, created_at
