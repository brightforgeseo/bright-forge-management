# 🚨 CRITICAL: YOU MUST RUN THIS SQL SCRIPT

## Why Message Editing Isn't Working

**You cannot edit messages because the database columns don't exist yet!**

The Edit button only appears on messages that have a `sender_id` field. Without running the SQL script, this field doesn't exist.

---

## ✅ STEP 1: Run This SQL Script

**File:** `ADD_MESSAGE_EDITING_COLUMNS.sql`

1. Open https://supabase.com/dashboard
2. Go to: **SQL Editor**
3. Click **"New query"**
4. Copy and paste this ENTIRE script:

```sql
-- ========================================
-- ADD MESSAGE EDITING AND AVATAR COLUMNS
-- Run this in Supabase SQL Editor
-- ========================================

-- Add new columns to chat_messages table for message editing
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS sender_id UUID,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- Create index on sender_id for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'chat_messages'
  AND column_name IN ('sender_id', 'is_edited', 'edited_at')
ORDER BY column_name;

-- Show a sample of the table structure
SELECT
  id,
  channel_id,
  sender,
  sender_id,
  text,
  is_edited,
  edited_at,
  created_at
FROM chat_messages
LIMIT 1;
```

5. Click **"Run"**

**Expected output:**
```
ALTER TABLE
CREATE INDEX

column_name | data_type | is_nullable | column_default
------------+-----------+-------------+---------------
edited_at   | timestamp | YES         | NULL
is_edited   | boolean   | YES         | false
sender_id   | uuid      | YES         | NULL
```

---

## ✅ STEP 2: Hard Refresh Your Browser

After the SQL runs successfully:

- **Mac:** `Cmd + Shift + R`
- **Windows/Linux:** `Ctrl + Shift + R`

---

## ✅ STEP 3: Test Message Editing

1. Send a NEW message in chat
2. Hover over the message → Edit button (pencil icon) should appear
3. Click Edit → Message becomes editable
4. Change the text → Press Enter or click Save
5. Message updates with "(edited)" indicator

---

## ❌ Why Old Messages Can't Be Edited

Messages sent BEFORE running the SQL script don't have `sender_id`, so they won't show the Edit button. This is normal.

**Only NEW messages** (sent after running SQL) can be edited.

---

## ✅ STEP 4 (OPTIONAL): Run Uploads Bucket SQL

**File:** `CHECK_UPLOADS_BUCKET.sql`

If profile picture uploads are failing, run this too:

```sql
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
```

---

## 🎯 What's Fixed in Latest Code

### ✅ Paste Auto-Send Fixed
- Text paste now manually inserts at cursor position
- Prevents any accidental auto-send triggers
- Image paste still works (uploads and sends automatically)

### ✅ Message Editing Ready (After SQL)
- Edit button appears on your own messages (hover to see)
- Click Edit → textarea appears
- Press Enter to save, Esc to cancel
- "(edited)" indicator appears on edited messages
- Real-time sync - all users see edits instantly

### ✅ Profile Pictures Ready (After Uploads SQL)
- Upload button in Settings
- Max 5MB, images only
- Shows in sidebar, chat, settings

### ✅ Online/Offline Status Working
- Green dot = online
- Gray = offline
- Updates in real-time

---

## 📋 Quick Checklist

Run in Supabase SQL Editor:
- [ ] `ADD_MESSAGE_EDITING_COLUMNS.sql` ← **REQUIRED FOR EDITING**
- [ ] `CHECK_UPLOADS_BUCKET.sql` ← **REQUIRED FOR PROFILE PICS**

Then:
- [ ] Hard refresh browser (`Cmd/Ctrl + Shift + R`)
- [ ] Send new message → Edit button appears on hover
- [ ] Edit message → works!
- [ ] Upload profile picture → works!

---

## 🔍 Still Not Working?

**If edit button doesn't appear:**
1. Check browser console (F12) for errors
2. Verify SQL ran successfully (should see "ALTER TABLE" in output)
3. Make sure you're hovering over YOUR OWN messages
4. Refresh the page

**If paste still auto-sends:**
1. Hard refresh browser (clear cache)
2. Check if you're using latest deployed code
3. Try incognito mode

**If uploads fail:**
1. Run `CHECK_UPLOADS_BUCKET.sql`
2. Check browser console for error details
3. Verify uploads bucket exists in Supabase Storage

---

## That's It!

Run the SQL scripts, refresh your browser, and everything should work!
