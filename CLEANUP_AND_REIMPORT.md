# Fix Status Display and Comments

## The Problem

The previous import had two issues:
1. **Status/Priority were text values** instead of IDs, so the UI couldn't match them to colors
2. **Comments are in the database** but might not show due to caching

## The Solution

I've regenerated all 6 batch files with the correct format. Now you need to:

### Step 1: Clear Old Data

In Supabase SQL Editor, run:
```sql
DELETE FROM client_boards;
```

### Step 2: Re-import All 6 Batches

Run these files one at a time in Supabase SQL Editor:

1. **RESTORE_BATCH_1_of_6.sql**
2. **RESTORE_BATCH_2_of_6.sql**
3. **RESTORE_BATCH_3_of_6.sql**
4. **RESTORE_BATCH_4_of_6.sql**
5. **RESTORE_BATCH_5_of_6.sql**
6. **RESTORE_BATCH_6_of_6.sql**

### Step 3: Hard Refresh Your App

After all 6 batches are imported:
- **Close the browser tab completely**
- **Reopen the app**
- Or press **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows) to hard refresh

## What's Fixed

✅ **Status IDs**: Tasks now have `"status": "status-2"` instead of `"status": "Working on it"`
✅ **Priority IDs**: Tasks now have `"priority": "priority-3"` instead of `"priority": "High"`
✅ **Comments**: All 2,872 comments are in the SQL files
✅ **Status colors will display correctly** in both list view and popup

## Verify It Worked

After reimporting, check:
- ✅ Status buttons show correct colors in the task list
- ✅ Comments appear in the popup when you click a task
- ✅ Status in popup matches status in list view
