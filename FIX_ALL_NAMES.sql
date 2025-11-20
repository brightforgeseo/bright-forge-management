-- ========================================
-- FIX ALL USER DISPLAY NAMES
-- Updates all profiles to have proper names
-- ========================================

-- Step 1: Show all profiles with their current names
SELECT
    p.id,
    p.full_name,
    u.email,
    'Current name' as status
FROM profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.full_name;

-- Step 2: Update profiles that have missing or ID-like names
-- This will set full_name to either the metadata name or email prefix
UPDATE profiles
SET full_name = COALESCE(
    (SELECT u.raw_user_meta_data->>'full_name'
     FROM auth.users u
     WHERE u.id = profiles.id),
    (SELECT split_part(u.email, '@', 1)
     FROM auth.users u
     WHERE u.id = profiles.id)
)
WHERE full_name IS NULL
   OR full_name = ''
   OR length(full_name) < 3
   OR full_name LIKE 'User %';

-- Step 3: Manually set Ben's name
UPDATE profiles
SET full_name = 'Ben Lowe'
WHERE id IN (
    SELECT p.id FROM profiles p
    JOIN auth.users u ON p.id = u.id
    WHERE u.email = 'bensocialbeesmedia@gmail.com'
);

-- Step 4: Verify all names are fixed
SELECT
    p.id,
    p.full_name,
    u.email,
    'UPDATED' as status
FROM profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.full_name;
