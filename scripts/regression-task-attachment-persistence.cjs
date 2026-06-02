const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const taskBoardPath = path.join(root, 'components', 'TaskBoard.tsx');
const src = fs.readFileSync(taskBoardPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

assert(src.includes('const saveClientBoardNow = useCallback(async (changedClientId: string'), 'TaskBoard has an immediate board-save helper');
assert(src.includes('clearTimeout(saveTimeoutRef.current);'), 'Immediate save cancels any stale debounced save');
assert(/return await saveClientBoard\(clientToSave, \{ attachmentMode: 'replace' \}\);/.test(src), 'Attachment saves replace the task attachment array in board_data');
assert(/const saved = await persistTaskAttachments\(taskModal, attachments\);\s*addToast\(saved \? 'success' : 'error', saved \? 'Attachment added and saved to task'/.test(src), 'Attachment upload flushes board_data before showing success');
assert(/const saved = await persistTaskAttachments\(taskModal, attachments\);\s*addToast\(saved \? 'info' : 'error', saved \? 'Attachment removed and saved'/.test(src), 'Attachment removal flushes board_data before showing success');

const databaseServicePath = path.join(root, 'services', 'databaseService.ts');
const databaseService = fs.readFileSync(databaseServicePath, 'utf8');
assert(/attachmentMode\?: 'merge' \| 'replace'/.test(databaseService), 'Board save supports explicit attachment replacement mode');
assert(/linkMode\?: 'merge' \| 'replace'/.test(databaseService), 'Board save supports explicit worksheet/client-sheet replacement mode');
assert(/options\.linkMode !== 'replace' && !hasValue\(nextTask\[field\]\)/.test(databaseService), 'Safe-save guard does not restore old links during explicit link edits');
assert(/Error updating board:[\s\S]{0,140}return false;/.test(databaseService), 'Board save reports update failures to callers');

const worksheetHandler = /onChange=\{\(e\) => updateTaskField\(activeClient\.id, group\.id, task\.id, 'worksheet', e\.target\.value\)\}[\s\S]{0,260}?onBlur=\{\(\) => saveClientBoardNow\(activeClient\.id, \{ linkMode: 'replace' \}\)\}/.test(src);
assert(worksheetHandler, 'Worksheet/proof link table input saves immediately on blur with replace mode');

const clientSheetHandler = /onChange=\{\(e\) => updateTaskField\(activeClient\.id, group\.id, task\.id, 'clientSheet', e\.target\.value\)\}[\s\S]{0,260}?onBlur=\{\(\) => saveClientBoardNow\(activeClient\.id, \{ linkMode: 'replace' \}\)\}/.test(src);
assert(clientSheetHandler, 'Client/live-site link table input saves immediately on blur with replace mode');

assert(src.includes('placeholder="Add or edit worksheet URL"'), 'Task modal exposes an editable worksheet URL field');
assert(src.includes('placeholder="Add or edit client sheet URL"'), 'Task modal exposes an editable client sheet URL field');
assert(/onBlur=\{\(\) => saveClientBoardNow\(taskModal\.clientId, \{ linkMode: 'replace' \}\)\}/.test(src), 'Task modal link edits save with replace mode on blur');

const servicePath = path.join(root, 'services', 'clientPortalService.ts');
const portalService = fs.readFileSync(servicePath, 'utf8');
assert(portalService.includes('task: task,'), 'Client portal projected tasks are sourced from current client board task JSON');

if (process.exitCode) process.exit(process.exitCode);
console.log('Task attachment/link persistence regression checks passed.');
