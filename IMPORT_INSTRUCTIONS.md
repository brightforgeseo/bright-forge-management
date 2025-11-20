# Import All Monday.com Boards - Instructions

## Summary

Successfully parsed **ALL 55 client boards** with **1,577 tasks** from your Monday.com export!

## What Was Recovered

All your client boards including the previously missing ones:
- ✓ Keanis O
- ✓ Flame Learning
- ✓ JDN Contracting and Electrical Services 10xr
- ✓ Simply Health Simon
- ✓ taobe Dev
- ✓ Loadout Systems Jack
- ✓ Venture Backlinks
- ✓ Com-Al Window 10xr
- ✓ SK Agency
- ✓ Ninja SEO Marketing UK
- ✓ Engineered Installations - 10xr
- ✓ PB Technologies - 10xr
- ✓ Vestd India
- ✓ Weskleen Supplies - 10xr
- ✓ SWS Group 10xr
- ✓ Allied heat transfer 10xr
- ✓ RKMRS - 10xr
- ✓ Advanced Air 10xr
- Plus 37 more client boards!

## Files Created

1. **RESTORE_ALL_BOARDS.sql** - Complete SQL script with ALL 55 boards (1,577 tasks)
2. **monday_data.json** - Parsed data in JSON format (for review)
3. **RESTORE_MONDAY_DATA.py** - Updated parser that handles all board formats
4. **generate_sql.py** - SQL generator with user mappings

## How to Import

### Step 1: Backup Existing Data (Important!)

Before running the import, back up your current boards:

```sql
-- Run this first to save a backup
SELECT board_data FROM client_boards;
```

### Step 2: Clear Existing Boards (Optional)

If you want to replace ALL existing boards with the Monday.com data:

1. Open `RESTORE_ALL_BOARDS.sql`
2. Find this line: `-- DELETE FROM client_boards;`
3. Uncomment it (remove the `--`): `DELETE FROM client_boards;`

**⚠️ WARNING**: This will delete ALL existing client boards!

### Step 3: Run the Import

1. Open Supabase SQL Editor
2. Copy and paste the contents of `RESTORE_ALL_BOARDS.sql`
3. Click "Run"
4. Wait for completion (may take 30-60 seconds for 55 boards)

### Step 4: Verify

1. Refresh your Bright Forge Portal app
2. Go to Project Tasks
3. You should see all 55 client boards!

## What's Included in Each Board

✓ Task titles
✓ Status (To Do, In Progress, Ben To Check, Sent To Client, etc.)
✓ Priority (Low, Medium, High, Critical)
✓ Due dates
✓ Person assignments (mapped to Supabase users):
  - Ben Lowe
  - Janin Canonero
  - Dee Tan
  - Farhan Nazardin
  - Alyssa Marie Donayre
✓ Worksheet URLs
✓ Client Sheet URLs
✓ Task groups with colors
✓ Comment threads (empty, ready to use)

## Team Member Mappings

Person assignments from Monday.com have been mapped to your Supabase users:

- **Ben Lowe** → `f9f11222-d2a9-4ae8-a327-8c4621d90b7c`
- **Janin Canonero** → `a1e57188-a322-42b2-9d33-b5df08033685`
- **Dee Tan** → `942055eb-54f6-426a-8194-b81ab83669f6`
- **Farhan Nazardin** → `01b597e9-43f0-4363-9ced-8b2613b1bbab`
- **Alyssa Marie Donayre** → `cede181a-edf9-40fa-b917-e208ea15d450`

## Notes

- All board formats have been handled (single group, multi-group, different header rows)
- Tasks without person assignments will show as unassigned
- Empty priority/status fields are preserved as-is
- All worksheet and client sheet URLs are intact
- Groups are color-coded for visual organization
- You can fill in any missing information directly in the app after import

## Troubleshooting

**If you get duplicate ID errors:**
- The board IDs are `board-1` through `board-55`
- If these conflict with existing boards, uncomment the DELETE line to clear them first

**If some boards don't appear:**
- Check the browser console for errors
- Verify the SQL completed without errors
- Check: `SELECT COUNT(*) FROM client_boards;` should return 55 (or 30 + 55 = 85 if you didn't delete existing)

**If you want to import only the missing boards:**
- You can manually copy just the specific INSERT statements for the missing boards from `RESTORE_ALL_BOARDS.sql`

## Success!

Once completed, you'll have ALL 55 client boards with 1,577 tasks restored in Bright Forge Portal! 🎉

You can now:
- View all tasks organized by client
- Click tasks to add comments
- Track worksheet and client sheet links
- Assign tasks to team members
- Monitor progress with status/priority filters
