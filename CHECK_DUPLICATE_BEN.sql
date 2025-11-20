-- ========================================
-- CHECK FOR DUPLICATE BEN PROFILES
-- ========================================

-- Check all profiles for Ben
SELECT
    p.id,
    p.full_name,
    u.email,
    'Profile entry' as type
FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.email ILIKE '%bensocial%'
   OR p.full_name ILIKE '%ben%'
ORDER BY p.full_name;

-- Check if there are multiple profiles with similar names
SELECT
    id,
    full_name,
    updated_at
FROM profiles
ORDER BY full_name;

-- Delete the profile that has email as full_name (if it exists)
-- Uncomment to run:
-- DELETE FROM profiles
-- WHERE full_name = 'bensocialbeesmedia@gmail.com'
-- OR full_name ILIKE '%bensocial%';
