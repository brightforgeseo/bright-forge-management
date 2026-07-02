-- EMERGENCY FIX: Make allowed_users table accessible
-- Run this in Supabase SQL Editor if invites still aren't working

-- Step 1: Check current policies
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'allowed_users';

-- Step 2: Drop all policies on allowed_users
DROP POLICY IF EXISTS "Anyone can check allowlist" ON allowed_users;
DROP POLICY IF EXISTS "Authenticated users can add to allowlist" ON allowed_users;
DROP POLICY IF EXISTS "Authenticated users can update allowlist" ON allowed_users;

-- Step 3: Create very permissive policies for debugging
-- (We'll tighten these later once it works)

-- Allow anyone to read (needed for signup check)
CREATE POLICY "allow_read_allowed_users"
ON allowed_users FOR SELECT
USING (true);

-- Allow authenticated users to insert
CREATE POLICY "allow_insert_allowed_users"
ON allowed_users FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update
CREATE POLICY "allow_update_allowed_users"
ON allowed_users FOR UPDATE
USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "allow_delete_allowed_users"
ON allowed_users FOR DELETE
USING (auth.role() = 'authenticated');

-- Step 4: Verify policies were created
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'allowed_users';

-- Step 5: Test manual insert (should work now)
-- Uncomment and modify the next line to test:
-- INSERT INTO allowed_users (email, full_name, role) VALUES ('test@example.com', 'Test User', 'Team Member');
