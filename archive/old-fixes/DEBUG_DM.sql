-- ========================================
-- DEBUG DM: Check EVERYTHING
-- Run this to see exactly what's wrong
-- ========================================

-- 1. Check all users and their IDs
SELECT
    'AUTH USERS' as check_type,
    u.id,
    u.email,
    'User exists in auth' as status
FROM auth.users u
ORDER BY u.email;

-- 2. Check all profiles
SELECT
    'PROFILES' as check_type,
    p.id,
    p.full_name,
    'Profile exists' as status
FROM profiles p
ORDER BY p.full_name;

-- 3. Check for missing profiles
SELECT
    'MISSING PROFILES' as check_type,
    u.id,
    u.email,
    'NO PROFILE - THIS IS THE PROBLEM' as status
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

-- 4. Check DM channels
SELECT
    'DM CHANNELS' as check_type,
    c.id,
    c.name,
    c.type,
    'DM channel exists' as status
FROM channels c
WHERE c.type = 'dm'
ORDER BY c.created_at DESC;

-- 5. Check if realtime is enabled
SELECT
    'REALTIME' as check_type,
    tablename,
    'Realtime enabled' as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND schemaname = 'public'
AND tablename IN ('chat_messages', 'channels', 'profiles');

-- 6. Summary
SELECT
    'SUMMARY' as check_type,
    (SELECT COUNT(*) FROM auth.users) as total_auth_users,
    (SELECT COUNT(*) FROM profiles) as total_profiles,
    (SELECT COUNT(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)) as missing_profiles,
    (SELECT COUNT(*) FROM channels WHERE type = 'dm') as dm_channels;
