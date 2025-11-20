-- ========================================
-- FIX NOW: Create the missing profile
-- ========================================

-- Step 1: See which user is missing a profile
SELECT
    u.id,
    u.email,
    'MISSING PROFILE' as problem
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

-- Step 2: Create profiles for ALL users that don't have one
INSERT INTO profiles (id, full_name)
SELECT
    u.id,
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        split_part(u.email, '@', 1)
    )
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

-- Step 3: Verify - should show 0 missing profiles
SELECT
    'FIXED' as status,
    (SELECT COUNT(*) FROM auth.users) as total_auth_users,
    (SELECT COUNT(*) FROM profiles) as total_profiles,
    (SELECT COUNT(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)) as missing_profiles;
