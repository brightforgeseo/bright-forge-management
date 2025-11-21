# Fix Notification Duplicates Issue

## Problem
You're seeing 31+ duplicate "Task Due Today" notifications because:

1. **Missing database column** - The `link_data` column didn't exist yet
2. **Duplicate check failed** - Query for JSONB field returned no results when column was missing
3. **Multiple logins** - Each login created new notifications for the same tasks

## Root Cause

**Before the fix:**
```typescript
// This query failed silently when link_data column didn't exist
const { data: existing } = await supabase
  .from('notifications')
  .select('id')
  .eq('link_data->taskId', task.id)  // ❌ Returns empty if column missing
  .maybeSingle();

if (existing) continue;  // Never skipped, always created duplicates
```

**After the fix:**
```typescript
// Now checks BOTH message text AND link_data
const isDuplicate = existing?.some(notif => {
  // Check by message text (always works, even without link_data column)
  if (notif.message === taskMessage) return true;
  // Also check link_data if it exists
  if (notif.link_data) {
    return linkData.taskId === task.id && linkData.boardId === boardData.id;
  }
  return false;
});
```

## How to Fix

### Step 1: Add the Missing Column

Run **ONE** of these SQL scripts in Supabase:

**Option A - Safest (Recommended):**
```sql
-- Copy/paste contents of WORKING_notification_fix.sql
```

**Option B - Simplest:**
```sql
-- Copy/paste contents of fix_notifications_simple.sql
```

**Option C - One-liner:**
```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_data JSONB;
```

### Step 2: Clean Up Duplicate Notifications

**Quick Fix (Nuclear Option):**
```sql
-- Run this in Supabase SQL Editor while logged in
-- Deletes ALL your notifications
DELETE FROM notifications WHERE user_id = auth.uid();
```

**OR use the UI:**
1. Open the notifications dropdown in your app
2. Click "Clear all" button
3. Confirm

**Surgical Fix (Keep latest of each):**
```sql
-- Copy/paste contents of cleanup_notifications.sql
-- Removes duplicates, keeps most recent for each task
```

### Step 3: Deploy Updated Code

The code fix is already in the repo. Just pull and deploy:

```bash
git pull origin main
npm install
npm run build
```

Or if you're on the latest commit already, you're good! ✅

## Verification

After fixing:

1. **Clear localStorage**:
   - Open browser DevTools → Console
   - Run: `localStorage.removeItem('lastDueDateCheck')`
   - This forces a fresh check

2. **Reload the app**

3. **Check notifications**:
   - Should only see ONE notification per task due today
   - No duplicates should appear on subsequent reloads

## Files Created

1. **`WORKING_notification_fix.sql`** - Add link_data column safely
2. **`fix_notifications_simple.sql`** - Minimal version
3. **`cleanup_notifications.sql`** - Remove duplicates intelligently
4. **`clear_my_notifications.sql`** - Nuclear option to clear all
5. **`SQL_TROUBLESHOOTING.md`** - Comprehensive SQL help

## Prevention

The updated code now:
- ✅ Checks message text first (always works)
- ✅ Also checks link_data if column exists
- ✅ Won't create duplicates even if column is missing
- ✅ Won't create duplicates on multiple logins same day

## Testing

To test the fix:

1. Run the SQL to add column and clear duplicates
2. Clear localStorage: `localStorage.removeItem('lastDueDateCheck')`
3. Reload page
4. Check notification count - should be correct
5. Reload page again - should NOT create more duplicates

## Emergency Clear

If notifications keep piling up:

**Via SQL:**
```sql
DELETE FROM notifications WHERE user_id = auth.uid();
```

**Via UI:**
Click the bell → "Clear all" button

**Via Browser Console:**
```javascript
// This will clear the app's daily check flag
localStorage.removeItem('lastDueDateCheck');
```

---

## Summary

**Root Issue:** Missing database column caused duplicate checks to fail
**Solution:** Add column + improve duplicate detection logic
**Cleanup:** Use provided SQL scripts to remove duplicates
**Status:** Fixed in latest commit ✅
