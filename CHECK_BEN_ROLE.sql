-- ========================================
-- CHECK BEN'S ROLE STATUS
-- ========================================

-- 1. Check if Ben is in allowed_users at all
SELECT
    'ALLOWED_USERS CHECK' as section,
    email,
    role,
    full_name
FROM allowed_users
WHERE email ILIKE '%bensocial%';

-- 2. Show ALL allowed_users
SELECT
    'ALL ALLOWED USERS' as section,
    email,
    role,
    full_name
FROM allowed_users
ORDER BY role DESC, email;

-- 3. Check auth.users for Ben
SELECT
    'AUTH USERS CHECK' as section,
    id,
    email,
    raw_user_meta_data->>'full_name' as metadata_name
FROM auth.users
WHERE email ILIKE '%bensocial%';

-- If Ben is NOT in allowed_users, run this:
-- INSERT INTO allowed_users (email, role, full_name)
-- VALUES ('bensocialbeesmedia@gmail.com', 'Owner', 'Ben Lowe');
