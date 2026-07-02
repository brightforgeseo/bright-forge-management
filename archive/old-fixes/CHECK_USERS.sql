-- ========================================
-- CHECK USERS: Diagnose DM issues
-- This shows exactly what's in your database
-- ========================================

-- Step 1: Show all auth users
SELECT
    'AUTH USERS' as section,
    u.id,
    u.email,
    u.created_at,
    u.raw_user_meta_data->>'full_name' as metadata_name
FROM auth.users u
ORDER BY u.created_at;

-- Step 2: Show all profiles
SELECT
    'PROFILES' as section,
    p.id,
    p.full_name,
    p.updated_at
FROM profiles p
ORDER BY p.full_name;

-- Step 3: Show which users are MISSING profiles
SELECT
    'MISSING PROFILES' as section,
    u.id as user_id,
    u.email,
    'NO PROFILE' as status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL;

-- Step 4: Show which profiles don't have auth users (orphaned)
SELECT
    'ORPHANED PROFILES' as section,
    p.id as profile_id,
    p.full_name,
    'NO AUTH USER' as status
FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.id IS NULL;

-- Step 5: Check if DM channels exist
SELECT
    'DM CHANNELS' as section,
    c.id,
    c.name,
    c.type,
    c.created_at
FROM channels c
WHERE c.type = 'dm'
ORDER BY c.created_at DESC;

-- Step 6: Count everything
SELECT
    'SUMMARY' as section,
    (SELECT COUNT(*) FROM auth.users) as total_auth_users,
    (SELECT COUNT(*) FROM profiles) as total_profiles,
    (SELECT COUNT(*) FROM channels WHERE type = 'dm') as total_dm_channels;
