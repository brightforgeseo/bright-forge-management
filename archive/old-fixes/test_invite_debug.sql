-- DEBUG: Test invite system step by step
-- Run each section separately to find where it fails

-- ===== SECTION 1: Check if you're authenticated =====
SELECT
  auth.uid() as my_user_id,
  auth.role() as my_role;
-- Expected: Should show your user ID and 'authenticated'
-- If NULL, you're not logged in!


-- ===== SECTION 2: Check if allowed_users table exists =====
SELECT * FROM allowed_users LIMIT 5;
-- Expected: Should show existing allowed users (or empty table)
-- If error: Table doesn't exist - run supabase_setup.sql


-- ===== SECTION 3: Check RLS is enabled =====
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'allowed_users';
-- Expected: rowsecurity = true
-- If false: RLS is disabled


-- ===== SECTION 4: Check policies exist =====
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'allowed_users';
-- Expected: Should see 3-4 policies (SELECT, INSERT, UPDATE, DELETE)
-- If empty: No policies exist - run fix_invites.sql


-- ===== SECTION 5: Test INSERT permission =====
-- This simulates what the app does
INSERT INTO allowed_users (email, full_name, role, temp_password)
VALUES ('debug-test@example.com', 'Debug Test User', 'Team Member', 'test123');
-- Expected: 1 row inserted
-- If error "new row violates row-level security": Policy is too restrictive


-- ===== SECTION 6: Verify the insert worked =====
SELECT * FROM allowed_users WHERE email = 'debug-test@example.com';
-- Expected: Should see the row you just inserted


-- ===== SECTION 7: Clean up test data =====
DELETE FROM allowed_users WHERE email = 'debug-test@example.com';


-- ===== SECTION 8: Check auth.users table =====
SELECT id, email, raw_user_meta_data
FROM auth.users
WHERE id = auth.uid();
-- This shows your current user info
