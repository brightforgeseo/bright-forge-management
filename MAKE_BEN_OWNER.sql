-- ========================================
-- MAKE BEN THE OWNER (Safe way)
-- ========================================

-- Step 1: Check current status
SELECT
    email,
    role,
    full_name,
    'Current role' as status
FROM allowed_users
WHERE email ILIKE '%bensocialbeesmedia@gmail.com%';

-- Step 2: Add Ben to allowed_users as Owner (or update if exists)
INSERT INTO allowed_users (email, role, full_name)
VALUES ('bensocialbeesmedia@gmail.com', 'Owner', 'Ben Lowe')
ON CONFLICT (email)
DO UPDATE SET
    role = 'Owner',
    full_name = 'Ben Lowe';

-- Step 3: Verify Ben is now Owner
SELECT
    email,
    role,
    full_name,
    'UPDATED - Now Owner' as status
FROM allowed_users
WHERE email ILIKE '%bensocialbeesmedia@gmail.com%';

-- Step 4: Show all users and their roles
SELECT
    email,
    role,
    full_name
FROM allowed_users
ORDER BY
    CASE role
        WHEN 'Owner' THEN 1
        WHEN 'Team Member' THEN 2
        ELSE 3
    END,
    email;
