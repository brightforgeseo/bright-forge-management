const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing Supabase URL/key env vars');
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const marker = `echo-roundtrip-${Date.now()}`;
const attachment = {
  id: marker,
  name: `${marker}.txt`,
  url: `/uploads/${marker}.txt`,
  type: 'file',
  size: 17,
  uploadedAt: new Date().toISOString(),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findTask(board) {
  for (const group of board.groups || []) {
    for (const task of group.tasks || []) {
      return { group, task };
    }
  }
  return null;
}

(async () => {
  const { data: rows, error: fetchError } = await supabase
    .from('client_boards')
    .select('id, updated_at, board_data')
    .not('archived', 'eq', true)
    .order('created_at', { ascending: true })
    .limit(20);
  if (fetchError) throw fetchError;

  const row = (rows || []).find(r => findTask(r.board_data));
  if (!row) throw new Error('No board with a task found');
  const original = clone(row.board_data);
  const { task } = findTask(original);
  const originalAttachments = clone(task.attachments || []);

  let restored = false;
  try {
    const addedBoard = clone(original);
    const addedTask = findTask(addedBoard).task;
    addedTask.attachments = [...(addedTask.attachments || []), attachment];

    const { error: addError } = await supabase
      .from('client_boards')
      .update({ board_data: addedBoard, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (addError) throw addError;

    const { data: afterAdd, error: addReadError } = await supabase
      .from('client_boards')
      .select('board_data')
      .eq('id', row.id)
      .maybeSingle();
    if (addReadError) throw addReadError;
    const liveAddedTask = findTask(afterAdd.board_data).task;
    if (!liveAddedTask.attachments?.some(a => a.id === marker)) {
      throw new Error('Attachment add did not persist to board_data');
    }

    const removedBoard = clone(afterAdd.board_data);
    const removedTask = findTask(removedBoard).task;
    removedTask.attachments = (removedTask.attachments || []).filter(a => a.id !== marker);

    const { error: removeError } = await supabase
      .from('client_boards')
      .update({ board_data: removedBoard, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (removeError) throw removeError;

    const { data: afterRemove, error: removeReadError } = await supabase
      .from('client_boards')
      .select('board_data')
      .eq('id', row.id)
      .maybeSingle();
    if (removeReadError) throw removeReadError;
    const liveRemovedTask = findTask(afterRemove.board_data).task;
    if (liveRemovedTask.attachments?.some(a => a.id === marker)) {
      throw new Error('Attachment remove did not persist to board_data');
    }

    // Restore exact original board_data so this probe leaves no task changes behind.
    const { error: restoreError } = await supabase
      .from('client_boards')
      .update({ board_data: original, updated_at: row.updated_at || new Date().toISOString() })
      .eq('id', row.id);
    if (restoreError) throw restoreError;
    restored = true;

    console.log(JSON.stringify({
      ok: true,
      boardDbId: row.id,
      boardId: original.id,
      boardName: original.name,
      taskId: task.id,
      taskTitle: task.title,
      originalAttachmentCount: originalAttachments.length,
      addPersisted: true,
      removePersisted: true,
      restored: true,
    }, null, 2));
  } finally {
    if (!restored) {
      await supabase.from('client_boards').update({ board_data: original, updated_at: row.updated_at || new Date().toISOString() }).eq('id', row.id);
    }
  }
})().catch(err => {
  console.error(err && (err.stack || err.message) || err);
  process.exit(1);
});
