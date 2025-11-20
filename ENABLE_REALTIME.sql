-- ========================================
-- ENABLE REALTIME: Fix DM messages not appearing
-- This enables Supabase Realtime for all tables
-- ========================================

-- Step 1: Enable realtime on all tables (ignore errors if already enabled)
DO $$
BEGIN
    -- Try to add each table, ignore if already exists
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE channels; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE client_boards; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE allowed_users; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Step 2: Verify realtime is enabled
SELECT
    schemaname,
    tablename,
    'Realtime enabled' as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND schemaname = 'public';

-- If the above returns rows, realtime is working!
-- If empty, run these commands:

-- Alternative method (if above doesn't work):
-- Go to Supabase Dashboard → Database → Replication
-- Enable replication for: chat_messages, channels, profiles

-- Step 3: Test by inserting a message
-- Uncomment and modify to test:
-- INSERT INTO chat_messages (channel_id, sender, text)
-- VALUES (
--   (SELECT id FROM channels WHERE name = 'general' LIMIT 1),
--   'Test User',
--   'Test realtime message'
-- );
