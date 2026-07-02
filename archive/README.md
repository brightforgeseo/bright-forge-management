# Archive

Historical files kept for reference — nothing here is needed to run or set
up the portal.

- `monday-import/` — the one-time Monday.com data migration (restore
  batches, source JSON, and the Python scripts that generated them).
- `old-fixes/` — one-off SQL fixes, debug queries, and outdated fix
  instructions from past incidents. The fixes they applied are already in
  the database; the current schema files live in the repo root
  (`supabase_setup.sql`, `chat-schema.sql`, `SETUP_*.sql`, `ADD_*.sql`).
