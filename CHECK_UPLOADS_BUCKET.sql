-- ========================================
-- CHECK AND FIX UPLOADS BUCKET
-- Run this in Supabase SQL Editor
-- ========================================

-- Check if uploads bucket exists
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'uploads';

-- Check existing policies on uploads bucket
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
WHERE tablename = 'objects'
  AND (policyname LIKE '%upload%' OR policyname LIKE '%Upload%')
ORDER BY policyname;

-- If uploads bucket doesn't have proper policies, create them:

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public uploads access" ON storage.objects;

-- Allow authenticated users to upload to uploads bucket
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploads'
  AND auth.role() = 'authenticated'
);

-- Allow anyone to view files in uploads bucket (public read)
CREATE POLICY "Public uploads access"
ON storage.objects FOR SELECT
USING (bucket_id = 'uploads');

-- Ensure uploads bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, 10485760) -- 10MB limit
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760;

-- Verify everything is set up correctly
SELECT 'Uploads bucket configuration:' as info;
SELECT * FROM storage.buckets WHERE id = 'uploads';

SELECT 'Uploads bucket policies:' as info;
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'objects'
  AND (
    policyname = 'Allow authenticated uploads'
    OR policyname = 'Public uploads access'
  );
