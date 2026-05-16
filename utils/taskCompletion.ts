import { ClientBoard, Task } from '../types';

const COMPLETED_STATUS_KEYWORDS = [
  'done',
  'complete',
  'completed',
  'finished',
  'closed',
  'approved',
  'shipped',
  'delivered',
  'resolved',
  'sent to client',
  'ben to check',
  'archived',
  'cancelled',
  'canceled',
];

const COMPLETED_STATUS_COLORS = [
  '#00c875',
  '#00ca72',
  '#22c55e',
  '#16a34a',
  '#15803d',
  '#166534',
  '#4ade80',
  '#86efac',
  'green',
];

const COMPLETED_GROUP_TITLES = ['done', 'completed', 'complete', 'cancelled', 'canceled', 'archived', 'closed'];

export const normalizeText = (value?: string): string => (value || '').trim().toLowerCase();

export const isCompletedGroup = (groupTitle?: string): boolean => {
  const title = normalizeText(groupTitle);
  return COMPLETED_GROUP_TITLES.some(doneTitle => title === doneTitle || title.includes(doneTitle));
};

export const isCompletedStatus = (
  statusId: string | undefined,
  statusDefs: ClientBoard['statusDefs'] = []
): boolean => {
  if (!statusId) return false;
  if (['Done', 'Completed', 'status-8'].includes(statusId)) return true;

  const statusDef = statusDefs.find(s => s.id === statusId);
  if (!statusDef) return false;

  const label = normalizeText(statusDef.label);
  const color = normalizeText(statusDef.color);

  return COMPLETED_STATUS_KEYWORDS.some(keyword => label.includes(keyword)) || COMPLETED_STATUS_COLORS.includes(color);
};

export const isTaskCompleted = (
  task: Task,
  statusDefs: ClientBoard['statusDefs'] = [],
  groupTitle?: string
): boolean => {
  return isCompletedGroup(groupTitle) || isCompletedStatus(task.status, statusDefs);
};

export const getStatusLabel = (statusId: string | undefined, statusDefs: ClientBoard['statusDefs'] = []): string => {
  if (!statusId) return 'No status';
  return statusDefs.find(s => s.id === statusId)?.label || statusId;
};

export const getPriorityLabel = (priorityId: string | undefined, priorityDefs: ClientBoard['priorityDefs'] = []): string => {
  if (!priorityId) return 'No priority';
  return priorityDefs.find(p => p.id === priorityId)?.label || priorityId;
};

export const isHighPriority = (priorityId: string | undefined, priorityDefs: ClientBoard['priorityDefs'] = []): boolean => {
  const label = getPriorityLabel(priorityId, priorityDefs).toLowerCase();
  return ['urgent', 'high', 'critical', 'priority', 'p1'].some(token => label.includes(token));
};

export const taskAssignees = (task: Task): string[] => {
  if (!task.assignedTo) return [];
  return Array.isArray(task.assignedTo) ? task.assignedTo.filter(Boolean) : [task.assignedTo];
};

export const isAssignedTo = (task: Task, profileId: string): boolean => taskAssignees(task).includes(profileId);
