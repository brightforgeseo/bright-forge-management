-- ========================================
-- FIX BEN'S DISPLAY NAME
-- Update profile to show "Ben Lowe" instead of email
-- ========================================

-- Step 1: Find Ben's profile
SELECT
    p.id,
    p.full_name,
    u.email,
    'Current name' as status
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email ILIKE '%bensocialbeesmedia@gmail.com%';

-- Step 2: Update Ben's profile to show "Ben Lowe"
UPDATE profiles
SET full_name = 'Ben Lowe'
WHERE id IN (
    SELECT p.id
    FROM profiles p
    JOIN auth.users u ON p.id = u.id
    WHERE u.email ILIKE '%bensocialbeesmedia@gmail.com%'
);

-- Step 3: Verify the change
SELECT
    p.id,
    p.full_name,
    u.email,
    'UPDATED' as status
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email ILIKE '%bensocialbeesmedia@gmail.com%';
