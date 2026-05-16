import { ClientBoard, Profile, Task } from '../types';
import { getPriorityLabel, getStatusLabel, isHighPriority, isTaskCompleted, taskAssignees } from '../utils/taskCompletion';

export type TaskWithContext = {
  task: Task;
  board: ClientBoard;
  boardId: string;
  boardName: string;
  groupId: string;
  groupTitle: string;
  statusLabel: string;
  priorityLabel: string;
  isCompleted: boolean;
  isHighPriority: boolean;
  assigneeIds: string[];
};

export type ClientRisk = {
  board: ClientBoard;
  score: number;
  level: 'Critical' | 'High' | 'Watch';
  openCount: number;
  overdueCount: number;
  highPriorityOverdue: number;
  dueThisWeek: number;
  blockedCount: number;
  unassignedCount: number;
  noDueDateCount: number;
  staleDays: number | null;
  reasons: string[];
};

export type WorkloadRow = {
  profile: Profile;
  openCount: number;
  overdueCount: number;
  dueThisWeekCount: number;
  highPriorityCount: number;
  blockedCount: number;
  completedThisWeek: number;
  risk: 'Overloaded' | 'Busy' | 'Healthy';
};

export type PipelineMetric = {
  key: string;
  label: string;
  open: number;
  overdue: number;
  blocked: number;
  dueThisWeek: number;
  completedThisWeek: number;
};

export type FeedItem = {
  id: string;
  type: 'risk' | 'done' | 'due' | 'data' | 'blocked';
  title: string;
  detail: string;
  tone: 'red' | 'amber' | 'green' | 'blue' | 'slate';
};

export type HygieneIssue = {
  id: string;
  label: string;
  count: number;
  severity: 'red' | 'amber' | 'blue';
  detail: string;
};

export type DashboardMetrics = {
  generatedAt: Date;
  boards: ClientBoard[];
  profiles: Profile[];
  allTasks: TaskWithContext[];
  openTasks: TaskWithContext[];
  overdueTasks: TaskWithContext[];
  dueTodayTasks: TaskWithContext[];
  dueThisWeekTasks: TaskWithContext[];
  completedThisWeekTasks: TaskWithContext[];
  blockedTasks: TaskWithContext[];
  unassignedTasks: TaskWithContext[];
  noDueDateTasks: TaskWithContext[];
  staleClients: ClientRisk[];
  clientRisks: ClientRisk[];
  workloadRows: WorkloadRow[];
  pipelineMetrics: PipelineMetric[];
  hygieneIssues: HygieneIssue[];
  feedItems: FeedItem[];
  briefing: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (date = new Date()): string => date.toISOString().slice(0, 10);

const addDays = (days: number, from = new Date()): string => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};

const daysSince = (dateStr?: string): number | null => {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / DAY_MS));
};

const profileName = (profile?: Profile): string => profile?.full_name || profile?.email || 'Team Member';

const includesAny = (value: string, needles: string[]) => needles.some(needle => value.includes(needle));

const pipelineForTask = (task: TaskWithContext): string => {
  const haystack = `${task.task.title} ${task.task.description || ''} ${task.groupTitle} ${task.statusLabel} ${task.priorityLabel}`.toLowerCase();
  if (includesAny(haystack, ['content', 'article', 'blog', 'copy', 'brief', 'outline', 'writer', 'writing'])) return 'content';
  if (includesAny(haystack, ['technical', 'dev', 'developer', 'fix', 'schema', 'speed', 'audit', 'crawl', 'index', 'redirect', 'bug'])) return 'technical';
  if (includesAny(haystack, ['report', 'reporting', 'monthly', 'loom', 'summary'])) return 'reporting';
  if (includesAny(haystack, ['backlink', 'link building', 'link insert', 'guest post', 'citation', 'outreach'])) return 'backlinks';
  return 'operations';
};

const isBlockedTask = (task: TaskWithContext): boolean => {
  const haystack = `${task.task.title} ${task.task.description || ''} ${task.groupTitle} ${task.statusLabel}`.toLowerCase();
  return includesAny(haystack, ['blocked', 'stuck', 'waiting', 'hold', 'on hold', 'needs access', 'client to', 'awaiting']);
};

export const buildDashboardMetrics = (boards: ClientBoard[], profiles: Profile[]): DashboardMetrics => {
  const today = isoDay();
  const weekEnd = addDays(7);
  const weekStart = addDays(-7);

  const allTasks = boards.flatMap(board =>
    (board.groups || []).flatMap(group =>
      (group.tasks || []).map(task => {
        const statusDefs = board.statusDefs || [];
        const priorityDefs = board.priorityDefs || [];
        const ctx: TaskWithContext = {
          task,
          board,
          boardId: board.id,
          boardName: board.name,
          groupId: group.id,
          groupTitle: group.title,
          statusLabel: getStatusLabel(task.status, statusDefs),
          priorityLabel: getPriorityLabel(task.priority, priorityDefs),
          isCompleted: isTaskCompleted(task, statusDefs, group.title),
          isHighPriority: isHighPriority(task.priority, priorityDefs),
          assigneeIds: taskAssignees(task),
        };
        return ctx;
      })
    )
  );

  const openTasks = allTasks.filter(t => !t.isCompleted);
  const overdueTasks = openTasks.filter(t => !!t.task.dueDate && t.task.dueDate < today);
  const dueTodayTasks = openTasks.filter(t => t.task.dueDate === today);
  const dueThisWeekTasks = openTasks.filter(t => !!t.task.dueDate && t.task.dueDate >= today && t.task.dueDate <= weekEnd);
  const completedThisWeekTasks = allTasks.filter(t => t.isCompleted && !!t.task.dueDate && t.task.dueDate >= weekStart && t.task.dueDate <= today);
  const blockedTasks = openTasks.filter(isBlockedTask);
  const unassignedTasks = openTasks.filter(t => t.assigneeIds.length === 0);
  const noDueDateTasks = openTasks.filter(t => !t.task.dueDate);

  const tasksByBoard = new Map<string, TaskWithContext[]>();
  for (const task of allTasks) {
    tasksByBoard.set(task.boardId, [...(tasksByBoard.get(task.boardId) || []), task]);
  }

  const clientRisks: ClientRisk[] = boards.map(board => {
    const boardTasks = tasksByBoard.get(board.id) || [];
    const open = boardTasks.filter(t => !t.isCompleted);
    const overdue = open.filter(t => !!t.task.dueDate && t.task.dueDate < today);
    const highPriorityOverdue = overdue.filter(t => t.isHighPriority).length;
    const dueThisWeek = open.filter(t => !!t.task.dueDate && t.task.dueDate >= today && t.task.dueDate <= weekEnd).length;
    const blockedCount = open.filter(isBlockedTask).length;
    const unassignedCount = open.filter(t => t.assigneeIds.length === 0).length;
    const noDueDateCount = open.filter(t => !t.task.dueDate).length;
    const boardStaleDays = daysSince((board as any).updated_at || (board as any).updatedAt);

    let score = 0;
    score += overdue.length * 4;
    score += highPriorityOverdue * 8;
    score += blockedCount * 6;
    score += unassignedCount * 2;
    score += Math.min(noDueDateCount, 25);
    if (open.length > 50) score += 20;
    if (boardStaleDays !== null && boardStaleDays > 14) score += 15;
    if (dueThisWeek > 20) score += 8;

    const reasons: string[] = [];
    if (overdue.length) reasons.push(`${overdue.length} overdue`);
    if (highPriorityOverdue) reasons.push(`${highPriorityOverdue} high-priority overdue`);
    if (blockedCount) reasons.push(`${blockedCount} blocked/waiting`);
    if (unassignedCount) reasons.push(`${unassignedCount} unassigned`);
    if (noDueDateCount) reasons.push(`${noDueDateCount} no due date`);
    if (boardStaleDays !== null && boardStaleDays > 14) reasons.push(`No update ${boardStaleDays}d`);
    if (!reasons.length && open.length) reasons.push(`${open.length} open`);

    return {
      board,
      score,
      level: score >= 100 ? 'Critical' : score >= 35 ? 'High' : 'Watch',
      openCount: open.length,
      overdueCount: overdue.length,
      highPriorityOverdue,
      dueThisWeek,
      blockedCount,
      unassignedCount,
      noDueDateCount,
      staleDays: boardStaleDays,
      reasons,
    };
  })
    .filter(risk => risk.score > 0 || risk.openCount === 0)
    .sort((a, b) => b.score - a.score || b.overdueCount - a.overdueCount);

  const staleClients = clientRisks.filter(risk => risk.staleDays !== null && risk.staleDays > 14);

  const workloadRows = profiles.map(profile => {
    const assignedOpen = openTasks.filter(t => t.assigneeIds.includes(profile.id));
    const assignedCompleted = completedThisWeekTasks.filter(t => t.assigneeIds.includes(profile.id));
    const overdueCount = assignedOpen.filter(t => !!t.task.dueDate && t.task.dueDate < today).length;
    const blockedCount = assignedOpen.filter(isBlockedTask).length;
    const highPriorityCount = assignedOpen.filter(t => t.isHighPriority).length;
    const dueThisWeekCount = assignedOpen.filter(t => !!t.task.dueDate && t.task.dueDate >= today && t.task.dueDate <= weekEnd).length;
    const risk: WorkloadRow['risk'] = overdueCount > 20 || assignedOpen.length > 55 ? 'Overloaded' : overdueCount > 5 || assignedOpen.length > 30 ? 'Busy' : 'Healthy';
    return {
      profile,
      openCount: assignedOpen.length,
      overdueCount,
      dueThisWeekCount,
      highPriorityCount,
      blockedCount,
      completedThisWeek: assignedCompleted.length,
      risk,
    };
  })
    .filter(row => row.openCount > 0 || row.completedThisWeek > 0)
    .sort((a, b) => b.overdueCount - a.overdueCount || b.openCount - a.openCount);

  const pipelineLabels: Record<string, string> = {
    content: 'Content',
    technical: 'Technical',
    reporting: 'Reporting',
    backlinks: 'Backlinks',
    operations: 'Operations',
  };

  const pipelineMetrics = Object.keys(pipelineLabels).map(key => {
    const open = openTasks.filter(t => pipelineForTask(t) === key);
    return {
      key,
      label: pipelineLabels[key],
      open: open.length,
      overdue: open.filter(t => !!t.task.dueDate && t.task.dueDate < today).length,
      blocked: open.filter(isBlockedTask).length,
      dueThisWeek: open.filter(t => !!t.task.dueDate && t.task.dueDate >= today && t.task.dueDate <= weekEnd).length,
      completedThisWeek: completedThisWeekTasks.filter(t => pipelineForTask(t) === key).length,
    };
  }).sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  const hygieneIssues: HygieneIssue[] = [
    {
      id: 'no-due-date',
      label: 'Open tasks without due dates',
      count: noDueDateTasks.length,
      severity: noDueDateTasks.length > 100 ? 'red' : 'amber',
      detail: 'These tasks cannot be planned properly.',
    },
    {
      id: 'unassigned',
      label: 'Open tasks without owners',
      count: unassignedTasks.length,
      severity: unassignedTasks.length > 50 ? 'red' : 'amber',
      detail: 'No owner means nobody is accountable.',
    },
    {
      id: 'blocked',
      label: 'Blocked or waiting tasks',
      count: blockedTasks.length,
      severity: blockedTasks.length > 20 ? 'red' : 'blue',
      detail: 'These need access, decisions, or chasing.',
    },
    {
      id: 'empty-boards',
      label: 'Boards with no open tasks',
      count: clientRisks.filter(r => r.openCount === 0).length,
      severity: 'blue',
      detail: 'Could be healthy, archived, or abandoned.',
    },
  ].filter(issue => issue.count > 0);

  const feedItems: FeedItem[] = [
    ...clientRisks.slice(0, 5).map(risk => ({
      id: `risk-${risk.board.id}`,
      type: 'risk' as const,
      title: `${risk.board.name} is ${risk.level.toLowerCase()} risk`,
      detail: risk.reasons.slice(0, 3).join(' · '),
      tone: risk.level === 'Critical' ? 'red' as const : 'amber' as const,
    })),
    ...blockedTasks.slice(0, 4).map(task => ({
      id: `blocked-${task.task.id}`,
      type: 'blocked' as const,
      title: `Blocked: ${task.task.title}`,
      detail: task.boardName,
      tone: 'amber' as const,
    })),
    ...dueTodayTasks.slice(0, 4).map(task => ({
      id: `due-${task.task.id}`,
      type: 'due' as const,
      title: `Due today: ${task.task.title}`,
      detail: task.boardName,
      tone: 'blue' as const,
    })),
    ...completedThisWeekTasks.slice(0, 3).map(task => ({
      id: `done-${task.task.id}`,
      type: 'done' as const,
      title: `Completed: ${task.task.title}`,
      detail: task.boardName,
      tone: 'green' as const,
    })),
  ].slice(0, 12);

  const topRisk = clientRisks[0];
  const overloaded = workloadRows.filter(row => row.risk === 'Overloaded');
  const briefing = [
    topRisk ? `${topRisk.board.name} is the highest-risk board: ${topRisk.reasons.slice(0, 4).join(', ')}.` : 'No client risk signals detected.',
    overdueTasks.length ? `${overdueTasks.length} open tasks are overdue across ${clientRisks.filter(r => r.overdueCount > 0).length} clients.` : 'No overdue open tasks. Suspiciously civilised.',
    blockedTasks.length ? `${blockedTasks.length} tasks look blocked or waiting and need unblocking before more work gets piled on.` : 'No obvious blocked-task pile-up detected.',
    overloaded.length ? `${overloaded.map(row => profileName(row.profile)).slice(0, 3).join(', ')} ${overloaded.length === 1 ? 'looks' : 'look'} overloaded.` : 'Team workload is not screaming from the data.',
    hygieneIssues.length ? `${hygieneIssues[0].count} ${hygieneIssues[0].label.toLowerCase()} is the biggest data hygiene problem.` : 'Data hygiene looks clean enough to trust the dashboard.',
  ];

  return {
    generatedAt: new Date(),
    boards,
    profiles,
    allTasks,
    openTasks,
    overdueTasks,
    dueTodayTasks,
    dueThisWeekTasks,
    completedThisWeekTasks,
    blockedTasks,
    unassignedTasks,
    noDueDateTasks,
    staleClients,
    clientRisks,
    workloadRows,
    pipelineMetrics,
    hygieneIssues,
    feedItems,
    briefing,
  };
};
