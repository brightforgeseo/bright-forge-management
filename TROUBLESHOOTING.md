# Troubleshooting Guide

## Common Issues and Solutions

### 🔴 "Activation failed: Database error saving new user"

**Problem**: User signup fails with database error.

**Root Causes:**
1. Missing RLS policies on `allowed_users` table
2. Profile creation trigger failing
3. Email already exists in database

**Solution:**

1. **Run the latest SQL setup script:**
   - Go to Supabase Dashboard → SQL Editor
   - Copy ALL of `supabase_setup.sql`
   - Run the entire script
   - This will drop and recreate all policies correctly

2. **Check if policies exist:**
   ```sql
   -- Run this in Supabase SQL Editor to verify:
   SELECT tablename, policyname FROM pg_policies
   WHERE schemaname = 'public'
   AND tablename = 'allowed_users';
   ```

   **Expected result:** You should see 3 policies:
   - `Anyone can check allowlist`
   - `Authenticated users can add to allowlist`
   - `Authenticated users can update allowlist`

3. **Clean up duplicate users (if needed):**
   ```sql
   -- Check for duplicate emails in auth
   SELECT email, COUNT(*) FROM auth.users GROUP BY email HAVING COUNT(*) > 1;

   -- If duplicates exist, delete them (CAREFUL!)
   -- DELETE FROM auth.users WHERE email = 'duplicate@email.com' AND id = 'old-user-id';
   ```

4. **Manually add user to allowlist:**
   ```sql
   -- Add the user to allowed_users table manually
   INSERT INTO allowed_users (email, full_name, role)
   VALUES ('user@email.com', 'User Name', 'Team Member')
   ON CONFLICT (email) DO NOTHING;
   ```

---

### 🔴 "This email has not been authorized by the Owner"

**Problem**: User tries to sign up but isn't in the allowlist.

**Solution:**

**Option 1: Owner invites the user**
1. Login as Owner
2. Click "Invite User" button
3. Fill in email and name
4. Click "Generate Password"
5. Send the email and password to the user

**Option 2: Manually add to database**
```sql
INSERT INTO allowed_users (email, full_name, temp_password, role)
VALUES (
  'newuser@email.com',
  'New User Name',
  'temporaryPassword123',
  'Team Member'
);
```

---

### 🔴 Chat messages not sending

**Problem**: Messages appear stuck or don't send.

**Checklist:**
1. ✅ User is logged in (check Supabase Auth dashboard)
2. ✅ RLS policies exist on `chat_messages` table
3. ✅ Channel exists in database

**Solution:**

1. **Verify RLS policies:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'chat_messages';
   ```

   Should show 3 policies:
   - Messages are viewable by everyone (SELECT)
   - Authenticated users can send messages (INSERT)
   - Authenticated users can delete messages (DELETE)

2. **Check authentication:**
   - Open browser DevTools (F12)
   - Console tab
   - Look for authentication errors
   - Verify `supabase.auth.getUser()` returns a user

3. **Test manual insert:**
   ```sql
   -- Try inserting a message manually
   INSERT INTO chat_messages (channel_id, sender, text)
   VALUES (
     (SELECT id FROM channels WHERE name = 'general' LIMIT 1),
     'Test User',
     'Test message'
   );
   ```

---

### 🔴 "Unknown User" in Direct Messages

**Problem**: DM shows "Unknown User" instead of name.

**Causes:**
1. Profile not created for user
2. Profiles table not syncing with auth.users

**Solution:**

1. **Check if profiles exist:**
   ```sql
   SELECT id, email, full_name FROM profiles;
   ```

2. **Manually create missing profiles:**
   ```sql
   INSERT INTO profiles (id, email, full_name)
   SELECT id, email, raw_user_meta_data->>'full_name'
   FROM auth.users
   WHERE id NOT IN (SELECT id FROM profiles);
   ```

3. **Verify trigger is working:**
   ```sql
   -- Check if trigger exists
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```

---

### 🔴 Can't delete DM conversations

**Problem**: Delete button doesn't work or DM doesn't disappear.

**Solution:**

1. **Refresh the page** - Sometimes realtime updates lag
2. **Check browser console** for errors (F12 → Console)
3. **Verify delete policy exists:**
   ```sql
   SELECT * FROM pg_policies
   WHERE tablename = 'channels'
   AND cmd = 'DELETE';
   ```

4. **Manual deletion:**
   ```sql
   -- Find the DM channel ID
   SELECT id, name FROM channels WHERE type = 'dm';

   -- Delete it (this cascades to messages)
   DELETE FROM channels WHERE id = 'channel-id-here';
   ```

---

### 🔴 Build errors

**Problem**: `npm run build` fails.

**Solution:**

1. **Clean build cache:**
   ```bash
   rm -rf node_modules .parcel-cache dist
   npm install
   npm run build
   ```

2. **Check Node version:**
   ```bash
   node --version  # Should be v16 or higher
   ```

3. **Fix TypeScript errors:**
   ```bash
   npm install --save-dev @types/react @types/react-dom
   ```

---

## Database Reset (Nuclear Option)

**⚠️ WARNING: This deletes ALL data!**

If nothing else works, you can reset the entire database:

```sql
-- Step 1: Drop all tables
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS channels CASCADE;
DROP TABLE IF EXISTS client_boards CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS allowed_users CASCADE;

-- Step 2: Drop the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Step 3: Re-run the entire supabase_setup.sql script
-- (Copy and paste the entire file)
```

---

## Useful Debugging Queries

### Check all tables
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';
```

### Check all RLS policies
```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Check user authentication
```sql
SELECT id, email, created_at, email_confirmed_at
FROM auth.users
ORDER BY created_at DESC;
```

### Check profiles sync
```sql
SELECT
  u.email as auth_email,
  p.email as profile_email,
  p.full_name
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id;
```

### Check channel messages
```sql
SELECT
  c.name as channel,
  COUNT(m.id) as message_count
FROM channels c
LEFT JOIN chat_messages m ON c.id = m.channel_id
GROUP BY c.name
ORDER BY message_count DESC;
```

---

## Still Having Issues?

1. **Check browser console** (F12 → Console tab) for JavaScript errors
2. **Check Supabase logs** (Dashboard → Logs → Query Performance)
3. **Verify environment**:
   - Supabase URL is correct in `lib/supabaseClient.ts`
   - Supabase Anon Key is correct
   - Project is not paused (free tier)
4. **Test in incognito mode** to rule out cache/extension issues
5. **Check GitHub Issues**: https://github.com/brightforgeseo/bright-forge-management/issues

---

## Quick Health Check

Run this to verify your setup:

```sql
-- Run all these checks at once
SELECT 'Tables' as check_type, COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public'
UNION ALL
SELECT 'RLS Policies', COUNT(*) FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'Users', COUNT(*) FROM auth.users
UNION ALL
SELECT 'Profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'Channels', COUNT(*) FROM channels
UNION ALL
SELECT 'Messages', COUNT(*) FROM chat_messages
UNION ALL
SELECT 'Allowed Users', COUNT(*) FROM allowed_users;
```

**Expected results:**
- Tables: 6
- RLS Policies: 16+
- Users: 1+ (your users)
- Profiles: Should match Users count
- Channels: 2+ (general, ask-ai)
- Messages: 0+ (depends on usage)
- Allowed Users: 0+ (invited users)
