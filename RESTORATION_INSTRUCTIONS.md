# Monday.com Data Restoration Instructions

## Summary

Successfully parsed **30 client boards** with **423 tasks** from your Monday.com export!

### What Was Recovered:

- **30 Client Boards** including:
  - Ideas And Answers Simon (4 groups, 31 tasks)
  - National Pumps And Boilers Jack (5 groups, 101 tasks)
  - Venture Ai Simon (3 groups, 9 tasks)
  - Ace Scaffolding (3 groups, 5 tasks)
  - And 26 more clients...

- **All Task Details**:
  ✓ Task titles
  ✓ Status (To Do, In Progress, Ben To Check, Sent To Client, etc.)
  ✓ Priority (Low, Medium, High, Critical)
  ✓ Due dates
  ✓ Person assignments (Ben Lowe, Janin Canonero, Dee Tan, etc.)
  ✓ Worksheet URLs
  ✓ Client Sheet URLs
  ✓ Task groups with colors

## Files Created:

1. **monday_data.json** - Parsed data in JSON format (for review)
2. **RESTORE_MONDAY_DATA.sql** - SQL script to import into Supabase
3. **GET_USER_IDS.sql** - Query to get user UUIDs for mapping
4. **RESTORATION_INSTRUCTIONS.md** - This file

## Next Steps:

### Step 1: Get User IDs from Supabase

Run `GET_USER_IDS.sql` in your Supabase SQL editor to get the UUID for each team member:

```sql
SELECT p.id as user_id, p.full_name, u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.full_name;
```

You'll get results like:
```
user_id: 123e4567-e89b-12d3-a456-426614174000
full_name: Ben Lowe
email: bensocialbeesmedia@gmail.com
```

### Step 2: Update Person Assignments

Open `RESTORE_MONDAY_DATA.sql` and find/replace the placeholders with real UUIDs:

- Find: `USER_ID_FOR_BEN_LOWE`
  Replace with: `[Ben's actual UUID from Step 1]`

- Find: `USER_ID_FOR_JANIN_CANONERO`
  Replace with: `[Janin's actual UUID]`

- Find: `USER_ID_FOR_DEE_TAN`
  Replace with: `[Dee's actual UUID]`

- Find: `USER_ID_FOR_FARHAN_NAZARDIN`
  Replace with: `[Farhan's actual UUID]`

- Find: `USER_ID_FOR_ALYSSA_MARIE_DONAYRE`
  Replace with: `[Alyssa's actual UUID]`

### Step 3: Review the SQL

Open `RESTORE_MONDAY_DATA.sql` and review the data to make sure it looks correct.

### Step 4: Clear Existing Data (Optional)

If you want to completely replace all existing boards, uncomment this line in the SQL:

```sql
-- DELETE FROM client_boards;
```

**⚠️ WARNING**: This will delete ALL existing client boards!

### Step 5: Run the SQL Script

1. Open Supabase SQL Editor
2. Copy and paste the contents of `RESTORE_MONDAY_DATA.sql`
3. Click "Run"
4. Wait for it to complete

### Step 6: Verify

1. Refresh your Bright Forge Portal app
2. Go to Project Tasks
3. You should see all 30 client boards with their tasks!

## Sample Data Restored:

### Ideas And Answers Simon
- **Groups**: Other Tasks, Content, Technical SEO, Done
- **Sample Tasks**:
  - Updating Management Sheet (Janin, Critical, Due: 2025-08-05)
  - Nov Outlines (Janin, Critical, Due: 2025-10-23)
  - Technical Work (Dee, Critical, Due: 2025-10-22)

### National Pumps And Boilers Jack
- **Groups**: Technical SEO, On-Page, Research And Planning, Content, Done
- **101 tasks** including technical SEO, content generation, and more

## Notes:

- All worksheet and client sheet URLs have been preserved
- Task dates, priorities, and statuses are intact
- Some tasks may have empty priority/status if they weren't set in Monday.com
- Groups are assigned rotating colors from a predefined palette

## Troubleshooting:

**If you get errors about duplicate IDs:**
- The board IDs are generated as `board-1`, `board-2`, etc.
- If you already have boards with these IDs, you'll need to either delete them first or modify the SQL to use different IDs

**If person assignments aren't showing:**
- Make sure you replaced ALL the `USER_ID_FOR_*` placeholders with real UUIDs
- Check that the UUIDs match exactly what's in your profiles table

**If you want to add more boards later:**
- Keep the `monday_data.json` file
- You can re-run the Python script to regenerate the SQL with modifications

## Success!

Once completed, you'll have all your Monday.com project data restored in your Bright Forge Portal! 🎉
