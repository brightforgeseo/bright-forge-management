-- ========================================
-- QUICK FIX: Run this entire script to fix invites
-- Copy and paste ALL of this into Supabase SQL Editor
-- ========================================

-- Step 1: Drop ALL existing policies on allowed_users
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'allowed_users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON allowed_users', pol.policyname);
    END LOOP;
END $$;

-- Step 2: Make sure RLS is enabled
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;

-- Step 3: Create simple, working policies
CREATE POLICY "allow_select_allowed_users"
ON allowed_users FOR SELECT
TO public
USING (true);

CREATE POLICY "allow_insert_allowed_users"
ON allowed_users FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "allow_update_allowed_users"
ON allowed_users FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "allow_delete_allowed_users"
ON allowed_users FOR DELETE
TO authenticated
USING (true);

-- Step 4: Verify policies were created
SELECT
    'SUCCESS: Policies created' as status,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'allowed_users';

-- Step 5: Test if you can insert (manual test - uncomment to try)
-- INSERT INTO allowed_users (email, full_name, role)
-- VALUES ('test@example.com', 'Test User', 'Team Member');

-- Step 6: Clean up test (uncomment if you ran step 5)
-- DELETE FROM allowed_users WHERE email = 'test@example.com';
