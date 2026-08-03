import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBusinessOsSnapshot,
  hasLinkedEvidence,
  isBenBusinessOsUser,
  isBusinessInboxUser,
} from '../services/businessOsModel.mjs';

const BEN_USER_ID = 'f9f11222-d2a9-4ae8-a327-8c4621d90b7c';
const SASSIN_USER_ID = 'de294f97-3677-43a5-ac1b-54706e29eef0';

test('Business OS access is restricted to Ben alone', () => {
  assert.equal(isBenBusinessOsUser(BEN_USER_ID), true);
  assert.equal(isBenBusinessOsUser(SASSIN_USER_ID), false);
  assert.equal(isBenBusinessOsUser('team-member'), false);
  assert.equal(isBenBusinessOsUser(''), false);
});

test('existing Business Inbox access remains available to Ben and Sassin', () => {
  assert.equal(isBusinessInboxUser(BEN_USER_ID), true);
  assert.equal(isBusinessInboxUser(SASSIN_USER_ID), true);
  assert.equal(isBusinessInboxUser('team-member'), false);
});

test('linked evidence requires a proof-bearing field rather than a status label', () => {
  assert.equal(hasLinkedEvidence({ status: 'Done', comments: [{ text: 'Finished' }] }), false);
  assert.equal(hasLinkedEvidence({ worksheet: 'https://docs.example.test/proof' }), true);
  assert.equal(hasLinkedEvidence({ attachments: [{ id: 'a1' }] }), true);
  assert.equal(hasLinkedEvidence({ comments: [{ text: 'Reference only: https://example.test/background' }] }), false);
  assert.equal(hasLinkedEvidence({ comments: [{ text: 'Proof: https://example.test/live' }] }), true);
  assert.equal(hasLinkedEvidence({ comments: [{ text: 'Implemented here https://example.test/live-result' }] }), true);
});

test('snapshot separates decisions, review, send and completed proof gaps', () => {
  const task = (id, title, statusLabel, isCompleted = false, extra = {}) => ({
    task: { id, title, status: statusLabel, dueDate: '2026-08-03', ...extra },
    boardId: `board-${id}`,
    boardName: `Client ${id}`,
    groupId: `group-${id}`,
    groupTitle: statusLabel,
    statusLabel,
    priorityLabel: 'High',
    isCompleted,
    isHighPriority: true,
    assigneeIds: [],
  });

  const decision = task('1', 'Ben approval required', 'Review');
  const review = task('2', 'Technical report', 'Review');
  const send = task('3', 'Monthly report', 'Send to client', false, { clientSheet: 'https://docs.example.test/report' });
  const proofGap = task('4', 'Published changes', 'Done', true);
  const proved = task('5', 'Verified migration', 'Done', true, { worksheet: 'https://docs.example.test/proof' });

  const snapshot = buildBusinessOsSnapshot({
    allTasks: [decision, review, send, proofGap, proved],
    openTasks: [decision, review, send],
    clientRisks: [
      { board: { id: 'critical', name: 'Critical Client' }, level: 'Critical', score: 120, reasons: ['4 overdue'] },
      { board: { id: 'high', name: 'High Client' }, level: 'High', score: 50, reasons: ['2 blocked'] },
    ],
    workloadRows: [],
  });

  assert.deepEqual(snapshot.decisionQueue.map(item => item.task.id), ['1']);
  assert.deepEqual(snapshot.reviewQueue.map(item => item.task.id), ['1', '2']);
  assert.deepEqual(snapshot.sendQueue.map(item => item.task.id), ['3']);
  assert.deepEqual(snapshot.completedProofGaps.map(item => item.task.id), ['4']);
  assert.equal(snapshot.criticalClientCount, 1);
  assert.equal(snapshot.atRiskClientCount, 2);
});
