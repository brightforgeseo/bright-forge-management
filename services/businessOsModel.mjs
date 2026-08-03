const BEN_BUSINESS_OS_USER_ID = 'f9f11222-d2a9-4ae8-a327-8c4621d90b7c';
const BUSINESS_INBOX_USER_IDS = new Set([
  BEN_BUSINESS_OS_USER_ID,
  'de294f97-3677-43a5-ac1b-54706e29eef0',
]);

const PROOF_COMMENT_RE = /\b(proof|evidence|readback|verification|verified|screenshot|implemented|implementation|published|live result)\b[^\n]{0,120}https?:\/\/[^\s)\]}>,]+/i;
const DECISION_RE = /\b(ben to check|ben approval|approval required|approve|decision required|needs ben|ben decision)\b/i;
const REVIEW_RE = /\b(review|qa|quality assurance|ben to check|on review|sent to check)\b/i;
const SEND_RE = /\b(send to client|sent to client|client handoff|ready to send)\b/i;

export const isBenBusinessOsUser = (userId = '') => String(userId) === BEN_BUSINESS_OS_USER_ID;
export const isBusinessInboxUser = (userId = '') => BUSINESS_INBOX_USER_IDS.has(String(userId));

export const hasLinkedEvidence = (task = {}) => {
  if (typeof task.worksheet === 'string' && task.worksheet.trim()) return true;
  if (typeof task.clientSheet === 'string' && task.clientSheet.trim()) return true;
  if (Array.isArray(task.attachments) && task.attachments.length > 0) return true;
  return Array.isArray(task.comments) && task.comments.some(comment => PROOF_COMMENT_RE.test(String(comment?.text || '')));
};

const taskText = item => [
  item?.task?.title,
  item?.task?.description,
  item?.statusLabel,
  item?.groupTitle,
].filter(Boolean).join(' ');

const stableTaskSort = (left, right) => {
  const leftDue = left?.task?.dueDate || '9999-12-31';
  const rightDue = right?.task?.dueDate || '9999-12-31';
  return leftDue.localeCompare(rightDue)
    || String(left?.boardName || '').localeCompare(String(right?.boardName || ''))
    || String(left?.task?.title || '').localeCompare(String(right?.task?.title || ''));
};

export const buildBusinessOsSnapshot = (metrics = {}) => {
  const allTasks = Array.isArray(metrics.allTasks) ? metrics.allTasks : [];
  const openTasks = Array.isArray(metrics.openTasks) ? metrics.openTasks : [];
  const clientRisks = Array.isArray(metrics.clientRisks) ? metrics.clientRisks : [];
  const workloadRows = Array.isArray(metrics.workloadRows) ? metrics.workloadRows : [];

  const decisionQueue = openTasks.filter(item => DECISION_RE.test(taskText(item))).sort(stableTaskSort);
  const reviewQueue = openTasks.filter(item => REVIEW_RE.test(taskText(item))).sort(stableTaskSort);
  const sendQueue = openTasks.filter(item => SEND_RE.test(taskText(item))).sort(stableTaskSort);
  const completedProofGaps = allTasks
    .filter(item => item?.isCompleted && !hasLinkedEvidence(item?.task))
    .sort(stableTaskSort);
  const openWithLinkedEvidence = openTasks.filter(item => hasLinkedEvidence(item?.task)).sort(stableTaskSort);

  const criticalClients = clientRisks.filter(risk => risk?.level === 'Critical');
  const atRiskClients = clientRisks.filter(risk => risk?.level === 'Critical' || risk?.level === 'High');
  const overloadedPeople = workloadRows.filter(row => row?.risk === 'Overloaded');

  return {
    decisionQueue,
    reviewQueue,
    sendQueue,
    completedProofGaps,
    openWithLinkedEvidence,
    criticalClients,
    atRiskClients,
    overloadedPeople,
    criticalClientCount: criticalClients.length,
    atRiskClientCount: atRiskClients.length,
  };
};
