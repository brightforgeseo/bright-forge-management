-- Check current RLS policies on chat_messages table
-- Run this to see what policies are currently active

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'chat_messages'
ORDER BY cmd, policyname;

-- Also check if RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'chat_messages';
