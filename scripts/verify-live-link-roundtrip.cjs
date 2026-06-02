const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

function findFirstTask(board) {
  for (const group of board.groups || []) {
    for (const task of group.tasks || []) {
      return { group, task };
    }
  }
  return null;
}

(async () => {
  const { data: rows, error } = await supabase
    .from('client_boards')
    .select('id, board_data')
    .neq('archived', true)
    .limit(20);
  if (error) throw error;

  const row = (rows || []).find((candidate) => findFirstTask(candidate.board_data));
  if (!row) throw new Error('No board with at least one task found');

  const original = JSON.parse(JSON.stringify(row.board_data));
  const stamp = Date.now();
  const worksheetUrl = `https://example.com/worksheet-${stamp}`;
  const clientSheetUrl = `https://example.com/client-sheet-${stamp}`;
  const changedWorksheetUrl = `https://example.com/worksheet-changed-${stamp}`;

  const target = findFirstTask(row.board_data);
  target.task.worksheet = worksheetUrl;
  target.task.clientSheet = clientSheetUrl;

  let update = await supabase
    .from('client_boards')
    .update({ board_data: row.board_data })
    .eq('id', row.id);
  if (update.error) throw update.error;

  let read = await supabase.from('client_boards').select('board_data').eq('id', row.id).single();
  if (read.error) throw read.error;
  let readTarget = findFirstTask(read.data.board_data);
  if (readTarget.task.worksheet !== worksheetUrl || readTarget.task.clientSheet !== clientSheetUrl) {
    throw new Error('Initial worksheet/clientSheet add did not persist');
  }

  readTarget.task.worksheet = changedWorksheetUrl;
  readTarget.task.clientSheet = '';
  update = await supabase
    .from('client_boards')
    .update({ board_data: read.data.board_data })
    .eq('id', row.id);
  if (update.error) throw update.error;

  read = await supabase.from('client_boards').select('board_data').eq('id', row.id).single();
  if (read.error) throw read.error;
  readTarget = findFirstTask(read.data.board_data);
  if (readTarget.task.worksheet !== changedWorksheetUrl) {
    throw new Error(`Worksheet replacement failed: ${readTarget.task.worksheet}`);
  }
  if (readTarget.task.clientSheet !== '') {
    throw new Error(`Client sheet clear failed: ${readTarget.task.clientSheet}`);
  }

  const restore = await supabase.from('client_boards').update({ board_data: original }).eq('id', row.id);
  if (restore.error) throw restore.error;

  console.log(JSON.stringify({
    status: 'pass',
    boardId: row.id,
    worksheetAdded: worksheetUrl,
    worksheetChanged: changedWorksheetUrl,
    clientSheetCleared: true,
    restored: true,
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
