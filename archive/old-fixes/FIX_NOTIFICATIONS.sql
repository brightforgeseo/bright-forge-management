-- ========================================
-- FIX REALTIME & NOTIFICATIONS - Run this NOW!
-- This fixes real-time notifications AND task syncing
-- ========================================

-- Step 1: Add DELETE policy for notifications (so users can delete their own)
DO $$
BEGIN
    CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'DELETE policy may already exist, continuing...';
END $$;

-- Step 2: Set REPLICA IDENTITY FULL (required for realtime filtering)
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE client_boards REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
ALTER TABLE channels REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- Step 3: Add ALL tables to realtime publication
-- notifications - for real-time notification delivery
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    RAISE NOTICE 'SUCCESS: notifications added to realtime!';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'notifications already in realtime';
WHEN OTHERS THEN NULL;
END $$;

-- client_boards - for task syncing between MyWork and TaskBoard
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE client_boards;
    RAISE NOTICE 'SUCCESS: client_boards added to realtime!';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'client_boards already in realtime';
WHEN OTHERS THEN NULL;
END $$;

-- chat_messages - for real-time chat
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
    RAISE NOTICE 'SUCCESS: chat_messages added to realtime!';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'chat_messages already in realtime';
WHEN OTHERS THEN NULL;
END $$;

-- channels - for channel updates
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE channels;
    RAISE NOTICE 'SUCCESS: channels added to realtime!';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'channels already in realtime';
WHEN OTHERS THEN NULL;
END $$;

-- profiles - for user profile updates
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    RAISE NOTICE 'SUCCESS: profiles added to realtime!';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'profiles already in realtime';
WHEN OTHERS THEN NULL;
END $$;

-- Step 4: Verify the fix - you should see ALL these tables listed
SELECT
    tablename,
    'ENABLED' as realtime_status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename IN ('notifications', 'client_boards', 'chat_messages', 'channels', 'profiles')
ORDER BY tablename;

-- Done! You should see all 5 tables listed above.
-- If any are missing, go to Supabase Dashboard > Database > Replication and manually enable them.
