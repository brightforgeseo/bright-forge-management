-- ========================================
-- MAKE USER OWNER
-- Changes a user's role to Owner
-- ========================================

-- Step 1: See all current users and their roles
SELECT
    email,
    role,
    full_name
FROM allowed_users
ORDER BY role DESC, email;

-- Step 2: Make a specific user the Owner
-- CHANGE THE EMAIL BELOW to the user you want to make Owner
UPDATE allowed_users
SET role = 'Owner'
WHERE email = 'bensocialbeesmedia@gmail.com';

-- Step 3: Verify the change
SELECT
    email,
    role,
    full_name,
    'UPDATED' as status
FROM allowed_users
WHERE role = 'Owner';

-- IMPORTANT NOTES:
-- 1. The role is stored in the 'allowed_users' table, NOT in 'profiles'
-- 2. The app checks this role when you log in
-- 3. You may need to log out and log back in to see the change
-- 4. Only users in 'allowed_users' can be assigned roles

-- Optional: Make EVERYONE an Owner (use with caution!)
-- UPDATE allowed_users SET role = 'Owner';

-- Optional: Reset everyone to Team Member except one person
-- UPDATE allowed_users SET role = 'Team Member';
-- UPDATE allowed_users SET role = 'Owner' WHERE email = 'bensocialbeesmedia@gmail.com';
