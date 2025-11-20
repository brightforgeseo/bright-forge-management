# ✅ Import Instructions - Batched Approach

The import has been split into **6 smaller batch files** to avoid timeout errors.

## Run These Files In Order:

### Step 1: Clear Existing Data (Optional)
If you want to replace ALL existing boards, open `RESTORE_BATCH_1_of_6.sql` and uncomment this line:
```sql
-- DELETE FROM client_boards;
```
Change it to:
```sql
DELETE FROM client_boards;
```

### Step 2: Run Each Batch File

Run these files **one at a time** in Supabase SQL Editor:

1. **RESTORE_BATCH_1_of_6.sql** - Boards 1-10 (374 tasks, 636 comments)
2. **RESTORE_BATCH_2_of_6.sql** - Boards 11-20 (357 tasks, 955 comments)
3. **RESTORE_BATCH_3_of_6.sql** - Boards 21-30 (395 tasks, 635 comments)
4. **RESTORE_BATCH_4_of_6.sql** - Boards 31-40 (211 tasks, 446 comments)
5. **RESTORE_BATCH_5_of_6.sql** - Boards 41-50 (160 tasks, 186 comments)
6. **RESTORE_BATCH_6_of_6.sql** - Boards 51-55 (80 tasks, 14 comments)

### Step 3: Verify

After running all 6 batches, check in Supabase:
```sql
SELECT COUNT(*) FROM client_boards;
```

You should see **55 total boards**.

## What You'll Get:

✅ All 55 client boards
✅ 1,577 tasks with correct statuses
✅ 2,872 comments from Monday.com
✅ Multiple person assignments
✅ Clean URLs
✅ No more "everything is Done" issue

---

**Tip:** If a batch fails, you can re-run just that batch without affecting the others.
