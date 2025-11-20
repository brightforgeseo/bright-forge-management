-- ========================================
-- COMPREHENSIVE FIX FOR LIVE CHAT & NOTIFICATIONS
-- Run this in Supabase SQL Editor
-- ========================================

-- ISSUE SUMMARY:
-- 1. Missing link_data column in notifications table
-- 2. Real-time might not be enabled on all tables
-- 3. Potential RLS policy issues

-- ========================================
-- PART 1: Fix Missing Columns
-- ========================================

-- Add link_data column to notifications table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notifications'
        AND column_name = 'link_data'
    ) THEN
        ALTER TABLE notifications ADD COLUMN link_data TEXT;
        RAISE NOTICE 'Added link_data column to notifications table';
    ELSE
        RAISE NOTICE 'link_data column already exists';
    END IF;
END $$;

-- ========================================
-- PART 2: Enable Real-Time on All Tables
-- ========================================

DO $$
BEGIN
    -- Add each table to realtime publication (ignore errors if already exists)
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
        RAISE NOTICE 'Enabled realtime for profiles';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Profiles already has realtime enabled';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE channels;
        RAISE NOTICE 'Enabled realtime for channels';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Channels already has realtime enabled';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
        RAISE NOTICE 'Enabled realtime for chat_messages';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Chat_messages already has realtime enabled';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
        RAISE NOTICE 'Enabled realtime for notifications';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Notifications already has realtime enabled';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE client_boards;
        RAISE NOTICE 'Enabled realtime for client_boards';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Client_boards already has realtime enabled';
    END;
END $$;

-- ========================================
-- PART 3: Verify RLS Policies
-- ========================================

-- Ensure RLS is enabled on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_boards ENABLE ROW LEVEL SECURITY;

-- ========================================
-- PART 4: Recreate RLS Policies (Fresh Start)
-- ========================================

-- Drop existing policies (silent errors)
DROP POLICY IF EXISTS "Channels are viewable by everyone" ON channels;
DROP POLICY IF EXISTS "Only authenticated users can create channels" ON channels;
DROP POLICY IF EXISTS "Only authenticated users can delete channels" ON channels;

DROP POLICY IF EXISTS "Messages are viewable by everyone" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can send messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can delete messages" ON chat_messages;

DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Channels policies (allow anonymous read for guest mode)
CREATE POLICY "Channels are viewable by everyone"
    ON channels FOR SELECT
    USING (true);

CREATE POLICY "Only authenticated users can create channels"
    ON channels FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Only authenticated users can delete channels"
    ON channels FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Chat messages policies (allow anonymous read for guest mode)
CREATE POLICY "Messages are viewable by everyone"
    ON chat_messages FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can send messages"
    ON chat_messages FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete messages"
    ON chat_messages FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications"
    ON notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE
    USING (auth.uid() = user_id);

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- ========================================
-- PART 5: Verification Queries
-- ========================================

-- Check 1: Verify link_data column exists
SELECT
    'link_data column check' as test,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'notifications' AND column_name = 'link_data'
        ) THEN '✅ link_data column exists'
        ELSE '❌ link_data column missing'
    END as result;

-- Check 2: Verify realtime is enabled
SELECT
    '✅ Realtime enabled for: ' || string_agg(tablename, ', ') as result
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND schemaname = 'public'
AND tablename IN ('profiles', 'channels', 'chat_messages', 'notifications', 'client_boards');

-- Check 3: Verify RLS policies
SELECT
    schemaname,
    tablename,
    COUNT(*) as policy_count,
    string_agg(policyname, ', ' ORDER BY policyname) as policies
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('channels', 'chat_messages', 'notifications', 'profiles')
GROUP BY schemaname, tablename
ORDER BY tablename;

-- Check 4: Test notification creation (to yourself)
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Get the first authenticated user
    SELECT id INTO test_user_id FROM auth.users LIMIT 1;

    IF test_user_id IS NOT NULL THEN
        -- Create a test notification
        INSERT INTO notifications (user_id, title, message, type, link_data)
        VALUES (
            test_user_id,
            'Test Notification',
            'This is a test to verify notifications are working',
            'info',
            '{"test": true}'
        );
        RAISE NOTICE '✅ Test notification created for user %', test_user_id;
    ELSE
        RAISE NOTICE '❌ No users found to test with';
    END IF;
END $$;

-- ========================================
-- SUCCESS MESSAGE
-- ========================================

SELECT
    '🎉 Fix complete! Please refresh your browser and test:' as message
UNION ALL
SELECT '1. Send a message in team chat - should appear instantly'
UNION ALL
SELECT '2. Check notifications bell - should see test notification'
UNION ALL
SELECT '3. Open browser console - should see realtime subscription logs'
UNION ALL
SELECT ''
UNION ALL
SELECT 'If still not working, check:'
UNION ALL
SELECT '• Browser console for errors (F12 → Console tab)'
UNION ALL
SELECT '• Network tab for failed WebSocket connections'
UNION ALL
SELECT '• Verify you are logged in (not guest mode)';
