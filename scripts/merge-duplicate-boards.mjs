#!/usr/bin/env node
/**
 * One-shot merge script for duplicate client_boards rows.
 *
 * What it does:
 *   1. Loads every row from client_boards.
 *   2. Groups rows by board_data.name (case-insensitive, trimmed).
 *   3. For each client with > 1 row:
 *        - Picks the oldest row as the "canonical" (preserves history).
 *        - Folds groups + tasks from every other row into the canonical.
 *        - Dedupes groups by title (case-insensitive).
 *        - Dedupes tasks by task.id; if no id, by title (case-insensitive).
 *        - Within a duplicate task pair, keeps the one with more comments
 *          (or, ties, the most recent dueDate / latest comment).
 *        - Saves the merged canonical row, then DELETES the duplicates.
 *   4. Prints a summary.
 *
 * Usage:
 *   node scripts/merge-duplicate-boards.mjs                # DRY RUN — prints plan, makes no changes
 *   node scripts/merge-duplicate-boards.mjs --apply        # APPLY — actually merges + deletes
 *
 * Safe to re-run. Idempotent.
 */

import { createClient } from '@supabase/supabase-js';

// Same project + service role key the app uses.
// Service role bypasses RLS — required for cross-user data ops like this.
const SUPABASE_URL = 'https://mvkbmozwplhsduiiakql.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2Jtb3p3cGxoc2R1aWlha3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDcyMzE2NiwiZXhwIjoyMDcwMjk5MTY2fQ.tZrqZjGl_wspvHCOAXBT4-4m_EC8v3w7bdXWud4D5W4';

const APPLY = process.argv.includes('--apply');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const norm = (s) => (s || '').toString().trim().toLowerCase();

function dedupeTasks(tasksFromAll) {
  // Score: (comments * 10) + has-due-date (1) + has-description (1). Higher wins.
  const score = (t) => (
    (Array.isArray(t.comments) ? t.comments.length : 0) * 10
    + (t.dueDate ? 1 : 0)
    + (t.description ? 1 : 0)
  );

  const byKey = new Map();
  for (const t of tasksFromAll) {
    const key = t.id ? `id:${t.id}` : `title:${norm(t.title)}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, t); continue; }
    if (score(t) > score(prev)) byKey.set(key, t);
  }
  return Array.from(byKey.values());
}

function mergeGroups(groupsFromAll) {
  // Group by normalized title; concat and dedupe tasks within each group bucket.
  const buckets = new Map();   // normTitle -> { canonical: groupShell, tasks: [] }
  for (const g of groupsFromAll) {
    const key = norm(g.title);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { canonical: { ...g, tasks: [] }, tasks: g.tasks ? [...g.tasks] : [] });
    } else {
      existing.tasks.push(...(g.tasks || []));
      // Prefer the one with a color set
      if (!existing.canonical.color && g.color) existing.canonical.color = g.color;
    }
  }
  return Array.from(buckets.values()).map(({ canonical, tasks }) => ({
    ...canonical,
    tasks: dedupeTasks(tasks)
  }));
}

function mergeBoardData(canonical, others) {
  // Combine groups across all rows
  const allGroups = [
    ...(canonical.groups || []),
    ...others.flatMap(o => o.groups || [])
  ];
  const mergedGroups = mergeGroups(allGroups);

  // Take statusDefs/priorityDefs from canonical; fall back to first non-empty in others
  const pickFirstNonEmpty = (key) => {
    if (canonical[key]?.length) return canonical[key];
    for (const o of others) if (o[key]?.length) return o[key];
    return canonical[key] || [];
  };

  return {
    ...canonical,
    statusDefs: pickFirstNonEmpty('statusDefs'),
    priorityDefs: pickFirstNonEmpty('priorityDefs'),
    groups: mergedGroups
  };
}

async function run() {
  console.log(`\n=== merge-duplicate-boards.mjs (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  const { data: rows, error } = await supabase
    .from('client_boards')
    .select('id, board_data, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load boards:', error);
    process.exit(1);
  }
  console.log(`Loaded ${rows.length} client_boards rows.`);

  // Group rows by client name (case-insensitive trim)
  const byName = new Map();
  for (const row of rows) {
    const name = norm(row.board_data?.name);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(row);
  }

  let totalDeletes = 0;
  let totalUpdates = 0;
  let totalTasksBefore = 0;
  let totalTasksAfter = 0;

  for (const [name, group] of byName.entries()) {
    if (group.length <= 1) continue;

    // Sort oldest-first; canonical is the oldest
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const canonicalRow = group[0];
    const dupeRows = group.slice(1);

    // Tally tasks before the merge
    const tasksBefore = group.reduce((acc, r) =>
      acc + (r.board_data?.groups || []).reduce((a, g) => a + (g.tasks?.length || 0), 0)
    , 0);

    const merged = mergeBoardData(canonicalRow.board_data, dupeRows.map(r => r.board_data));
    const tasksAfter = (merged.groups || []).reduce((a, g) => a + (g.tasks?.length || 0), 0);

    totalTasksBefore += tasksBefore;
    totalTasksAfter += tasksAfter;

    console.log(
      `[${canonicalRow.board_data.name}] ${group.length} rows → 1; ` +
      `${tasksBefore} tasks → ${tasksAfter} tasks; deleting ${dupeRows.length} dupes`
    );

    if (APPLY) {
      const { error: updErr } = await supabase
        .from('client_boards')
        .update({ board_data: merged, updated_at: new Date().toISOString() })
        .eq('id', canonicalRow.id);
      if (updErr) {
        console.error(`  ✗ failed to update canonical row ${canonicalRow.id}:`, updErr);
        continue;
      }
      totalUpdates++;

      const dupeIds = dupeRows.map(r => r.id);
      const { error: delErr } = await supabase
        .from('client_boards')
        .delete()
        .in('id', dupeIds);
      if (delErr) {
        console.error(`  ✗ failed to delete dupes for ${name}:`, delErr);
        continue;
      }
      totalDeletes += dupeIds.length;
    }
  }

  console.log(`\n--- summary ---`);
  console.log(`Clients with duplicates merged: ${[...byName.values()].filter(g => g.length > 1).length}`);
  console.log(`Tasks before: ${totalTasksBefore} | after: ${totalTasksAfter} (${totalTasksBefore - totalTasksAfter} duplicates dropped)`);
  if (APPLY) {
    console.log(`Rows updated: ${totalUpdates} | rows deleted: ${totalDeletes}`);
    console.log(`\nDONE — refresh the app and Echo's numbers should match the UI.`);
  } else {
    console.log(`\nDRY RUN — no changes made. Re-run with --apply to merge for real.`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
