-- ========================================
-- FIX MISSING USERS: Sync auth.users with profiles
-- Run this to create missing user profiles
-- ========================================

-- Step 1: Check which users are missing profiles
SELECT
    u.id,
    u.email,
    u.created_at,
    CASE
        WHEN p.id IS NULL THEN 'MISSING PROFILE'
        ELSE 'Profile exists'
    END as status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
ORDER BY u.created_at DESC;

-- Step 2: Create profiles for users that don't have one
INSERT INTO profiles (id, full_name)
SELECT
    u.id,
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        split_part(u.email, '@', 1)
    ) as full_name
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL;

-- Step 3: Verify all users now have profiles
SELECT
    COUNT(*) FILTER (WHERE p.id IS NOT NULL) as users_with_profiles,
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE p.id IS NULL) as missing_profiles
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id;

-- Step 4: Show all profiles with their auth email
SELECT p.id, u.email, p.full_name
FROM profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.full_name;

-- Expected: All users should have profiles now!
