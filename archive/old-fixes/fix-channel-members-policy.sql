-- =====================================================
-- FIX: Channel Members RLS Policy
-- The original policy has a circular dependency issue
-- =====================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view members of their channels" ON channel_members;

-- Create a better policy that checks channels directly
CREATE POLICY "Users can view members of their channels"
  ON channel_members FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      -- Can view members of public channels
      channel_id IN (SELECT id FROM channels WHERE is_private = FALSE)
      OR
      -- Can view members of private channels they own
      channel_id IN (SELECT id FROM channels WHERE owner_id = auth.uid())
      OR
      -- Can view members of private channels they belong to
      user_id = auth.uid()
    )
  );

-- Verify the policy was created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'channel_members'
ORDER BY policyname;
