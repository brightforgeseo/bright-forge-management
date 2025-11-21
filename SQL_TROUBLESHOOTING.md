# SQL Troubleshooting Guide

## Issue: SQL Scripts Failed

### Common Errors & Solutions

---

## Error 1: "column email does not exist"

**Problem:** The `profiles` table doesn't have an `email` column, or you're querying the wrong table.

**Solution:**
```sql
-- Check what columns exist in profiles table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND table_schema = 'public';
```

If `email` is missing, add it:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
```

---

## Error 2: "data type text has no default operator class for access method gin"

**Problem:** Creating a GIN index on a TEXT column without specifying the operator class.

**Solution:** Use `jsonb_path_ops` for JSONB columns:
```sql
-- Wrong:
CREATE INDEX idx_name ON notifications USING gin(link_data);

-- Correct:
CREATE INDEX idx_name ON notifications USING gin(link_data jsonb_path_ops);

-- Or just skip the index entirely for now:
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_data JSONB;
```

---

## Step-by-Step Fix for Notifications

### Option 1: Simple Fix (Recommended)

Use `WORKING_notification_fix.sql`:

1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `WORKING_notification_fix.sql`
3. Paste and click "Run"
4. Check the output - should show all columns including `link_data`

### Option 2: Manual Fix

Run these commands one at a time:

```sql
-- 1. Add the column
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_data JSONB;

-- 2. Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND table_schema = 'public';
```

### Option 3: Nuclear Option (If all else fails)

If the table is messed up and you don't care about existing notifications:

```sql
-- WARNING: This deletes all notifications!
DROP TABLE IF EXISTS notifications CASCADE;

-- Then re-run the CREATE TABLE from supabase_setup.sql
CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  link_view TEXT,
  link_data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Re-enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Recreate policies
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);
```

---

## Checking Current Table Structure

Run this to see exactly what you have:

```sql
-- Show all columns in notifications table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
ORDER BY ordinal_position;

-- Show all indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'notifications'
  AND schemaname = 'public';

-- Show all policies
SELECT
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'notifications'
  AND schemaname = 'public';
```

---

## Expected Table Structure

After running the fix, you should have:

| Column Name  | Data Type | Nullable |
|--------------|-----------|----------|
| id           | uuid      | NO       |
| user_id      | uuid      | YES      |
| title        | text      | NO       |
| message      | text      | NO       |
| type         | text      | YES      |
| link_view    | text      | YES      |
| **link_data**| **jsonb** | **YES**  |
| is_read      | boolean   | YES      |
| created_at   | timestamp | YES      |

---

## Still Having Issues?

1. **Check your Supabase logs**: Dashboard → Logs → Postgres Logs
2. **Verify table exists**:
   ```sql
   SELECT EXISTS (
     SELECT FROM pg_tables
     WHERE schemaname = 'public'
     AND tablename = 'notifications'
   );
   ```
3. **Check permissions**: Make sure you're running as a superuser or owner
4. **Try the simple fix**: Just add the column without the index:
   ```sql
   ALTER TABLE notifications ADD COLUMN link_data JSONB;
   ```

---

## Files to Use

1. **`WORKING_notification_fix.sql`** ← Start here (safest)
2. **`fix_notifications_simple.sql`** ← Minimal version
3. **`add_notification_link_data.sql`** ← Original (has index, may fail on some setups)

---

## After Fix is Applied

Test that it works:

```sql
-- Insert a test notification
INSERT INTO notifications (user_id, title, message, type, link_data)
VALUES (
  auth.uid(),
  'Test Notification',
  'This is a test',
  'info',
  '{"taskId": "123", "boardId": "456"}'::jsonb
);

-- Query with link_data filter
SELECT * FROM notifications
WHERE link_data->>'taskId' = '123';

-- Clean up test
DELETE FROM notifications WHERE title = 'Test Notification';
```

If these queries work, you're all set! ✅
