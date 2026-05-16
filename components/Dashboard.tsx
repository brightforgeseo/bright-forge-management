import React, { useState, useEffect } from 'react';
import { ToolView, User, ClientBoard, Profile, Task } from '../types';
import { fetchClientBoards, fetchProfiles } from '../services/databaseService';

interface DashboardProps {
  currentUser: User;
  setCurrentView: (view: ToolView) => void;
}

type TaskWithContext = {
  task: Task;
  boardId: string;
  boardName: string;
  groupTitle: string;
  statusDefs: ClientBoard['statusDefs'];
};

const COMPLETED_STATUS_KEYWORDS = ['done', 'complete', 'finished', 'closed', 'approved', 'shipped', 'delivered', 'resolved', 'sent to client', 'ben to check', 'archived'];
const COMPLETED_STATUS_COLORS = ['#00c875', '#00ca72', '#22c55e', '#16a34a', '#15803d', '#166534', '#4ade80', '#86efac', 'green'];
const COMPLETED_GROUP_TITLES = ['done', 'completed', 'cancelled', 'canceled', 'archived', 'closed'];

const isCompletedGroup = (groupTitle?: string): boolean => {
  const title = (groupTitle || '').trim().toLowerCase();
  return COMPLETED_GROUP_TITLES.includes(title);
};

const isCompletedStatus = (statusId: string, statusDefs: ClientBoard['statusDefs'] = []): boolean => {
  if (!statusId) return false;
  if (['Done', 'Completed', 'status-8'].includes(statusId)) return true;

  const statusDef = statusDefs.find(s => s.id === statusId);
  if (!statusDef) return false;

  const label = (statusDef.label || '').toLowerCase();
  const color = (statusDef.color || '').toLowerCase();
  return COMPLETED_STATUS_KEYWORDS.some(keyword => label.includes(keyword)) || COMPLETED_STATUS_COLORS.includes(color);
};

const isTaskCompleted = (task: Task, statusDefs: ClientBoard['statusDefs'], groupTitle?: string): boolean => {
  return isCompletedGroup(groupTitle) || isCompletedStatus(task.status, statusDefs);
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const dateOffset = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const formatDayLabel = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
};

const attentionDotClass = (count: number): string => {
  if (count >= 3) return 'bg-red-500';
  if (count >= 1) return 'bg-amber-400';
  return 'bg-green-500';
};

const isAssignedTo = (task: Task, profileId: string): boolean => {
  if (!task.assignedTo) return false;
  if (Array.isArray(task.assignedTo)) return task.assignedTo.includes(profileId);
  return task.assignedTo === profileId;
};

const navShortcuts: { view: ToolView; label: string; icon: React.ReactNode }[] = [
  {
    view: ToolView.KEYWORD_RESEARCH,
    label: 'Keywords',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    view: ToolView.CONTENT_GENERATOR,
    label: 'Content',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  {
    view: ToolView.SITE_AUDIT,
    label: 'SEO Audit',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    view: ToolView.TASKS,
    label: 'Tasks',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h3" />
      </svg>
    ),
  },
  {
    view: ToolView.TEAM_CHAT,
    label: 'Team Chat',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    view: ToolView.ECHO_WORKSPACES,
    label: 'Echo AI',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const Dashboard: React.FC<DashboardProps> = ({ currentUser, setCurrentView }) => {
  const [boards, setBoards] = useState<ClientBoard[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [b, p] = await Promise.all([fetchClientBoards(), fetchProfiles()]);
      setBoards(b);
      setProfiles(p);
      setLoading(false);
    };
    load();
  }, []);

  const today = todayStr();
  const weekEnd = dateOffset(7);
  const activityWindowStart = dateOffset(-14);
  const activityWindowEnd = dateOffset(14);

  // Flatten all tasks with board and group context so dashboard counts match the task board.
  const allTasks: TaskWithContext[] = boards.flatMap(board =>
    board.groups.flatMap(group =>
      group.tasks.map(task => ({
        task,
        boardId: board.id,
        boardName: board.name,
        groupTitle: group.title,
        statusDefs: board.statusDefs || [],
      }))
    )
  );

  const openTasks = allTasks.filter(t => !isTaskCompleted(t.task, t.statusDefs, t.groupTitle));

  const overdueTasks = openTasks.filter(
    t => t.task.dueDate && t.task.dueDate < today
  );

  const dueThisWeekTasks = openTasks.filter(
    t => t.task.dueDate && t.task.dueDate >= today && t.task.dueDate <= weekEnd
  );

  // Clients with no open task due within the 14-day activity window (past or future)
  const inactiveClients = boards.filter(board => {
    const openBoardTasks = board.groups
      .flatMap(group => group.tasks.map(task => ({ task, groupTitle: group.title })))
      .filter(({ task, groupTitle }) => !isTaskCompleted(task, board.statusDefs || [], groupTitle));
    if (openBoardTasks.length === 0) return true;
    const hasActivity = openBoardTasks.some(
      ({ task }) => task.dueDate && task.dueDate >= activityWindowStart && task.dueDate <= activityWindowEnd
    );
    return !hasActivity;
  });

  // Needs Attention: clients with overdue open tasks, sorted by overdue count desc
  const clientOverdueList = boards
    .map(board => {
      const count = board.groups
        .flatMap(group => group.tasks.map(task => ({ task, groupTitle: group.title })))
        .filter(({ task, groupTitle }) => !isTaskCompleted(task, board.statusDefs || [], groupTitle) && task.dueDate && task.dueDate < today).length;
      return { board, overdueCount: count };
    })
    .filter(x => x.overdueCount > 0)
    .sort((a, b) => b.overdueCount - a.overdueCount);

  // Team Workload: profiles with at least one open task assigned
  const workloadRows = profiles
    .map(profile => {
      const openCount = openTasks.filter(t => isAssignedTo(t.task, profile.id)).length;
      return { profile, openCount };
    })
    .filter(row => row.openCount > 0)
    .sort((a, b) => b.openCount - a.openCount);

  const maxLoad = workloadRows.reduce((m, r) => Math.max(m, r.openCount), 1);

  // Due This Week grouped by day, capped at 10 total tasks
  const dueByDay: Record<string, TaskWithContext[]> = {};
  for (const t of dueThisWeekTasks) {
    const key = t.task.dueDate;
    if (!dueByDay[key]) dueByDay[key] = [];
    dueByDay[key].push(t);
  }
  const sortedDueDays = Object.keys(dueByDay).sort();
  let dueDisplayCount = 0;
  const dueDisplay: { day: string; tasks: TaskWithContext[] }[] = [];
  for (const day of sortedDueDays) {
    if (dueDisplayCount >= 10) break;
    const remaining = 10 - dueDisplayCount;
    const dayTasks = dueByDay[day].slice(0, remaining);
    dueDisplay.push({ day, tasks: dayTasks });
    dueDisplayCount += dayTasks.length;
  }

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = currentUser.name.split(' ')[0];
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-portal-soft animate-pulse text-base">Loading briefing...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-white">
          {greeting}, {firstName}
        </h2>
        <p className="text-portal-soft text-sm">
          {dateLabel} &middot; Morning Briefing
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-portal-surface rounded-xl p-4 border border-white/[0.07]">
          <div className="text-3xl font-bold text-white">{openTasks.length}</div>
          <div className="text-portal-soft text-xs mt-1">Open Tasks</div>
        </div>
        <div className="bg-portal-surface rounded-xl p-4 border border-white/[0.07]">
          <div className={`text-3xl font-bold ${overdueTasks.length > 0 ? 'text-red-400' : 'text-white'}`}>
            {overdueTasks.length}
          </div>
          <div className="text-portal-soft text-xs mt-1">Overdue</div>
        </div>
        <div className="bg-portal-surface rounded-xl p-4 border border-white/[0.07]">
          <div className={`text-3xl font-bold ${inactiveClients.length > 0 ? 'text-amber-400' : 'text-white'}`}>
            {inactiveClients.length}
          </div>
          <div className="text-portal-soft text-xs mt-1">Inactive Clients (14d)</div>
        </div>
        <div className="bg-portal-surface rounded-xl p-4 border border-white/[0.07]">
          <div className="text-3xl font-bold text-brand-600">{dueThisWeekTasks.length}</div>
          <div className="text-portal-soft text-xs mt-1">Due This Week</div>
        </div>
      </div>

      {/* Needs Attention + Team Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Needs Attention */}
        <div className="bg-portal-surface rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Needs Attention</h3>
            <span className="text-xs text-portal-soft">
              {clientOverdueList.length} {clientOverdueList.length === 1 ? 'client' : 'clients'} overdue
            </span>
          </div>
          {clientOverdueList.length === 0 ? (
            <div className="px-5 py-8 text-center text-portal-soft text-sm">
              No overdue tasks across any client. Nice work.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {clientOverdueList.map(({ board, overdueCount }) => (
                <div
                  key={board.id}
                  onClick={() => setCurrentView(ToolView.TASKS)}
                  className="px-5 py-3 flex items-center justify-between hover:bg-portal-surface2 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${attentionDotClass(overdueCount)}`}
                    />
                    <span className="text-sm text-portal-text font-medium">{board.name}</span>
                  </div>
                  <span className="text-xs text-red-400 font-medium tabular-nums">
                    {overdueCount} overdue
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team Workload */}
        <div className="bg-portal-surface rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07]">
            <h3 className="font-semibold text-white text-sm">Team Workload</h3>
          </div>
          {workloadRows.length === 0 ? (
            <div className="px-5 py-8 text-center text-portal-soft text-sm">
              No open tasks are currently assigned to team members.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {workloadRows.map(({ profile, openCount }) => {
                const barPct = Math.round((openCount / maxLoad) * 100);
                return (
                  <div key={profile.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-portal-text">
                        {profile.full_name || 'Team Member'}
                      </span>
                      <span className="text-xs text-portal-soft tabular-nums">
                        {openCount} open
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-600 rounded-full transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Due This Week */}
      <div className="bg-portal-surface rounded-xl border border-white/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <h3 className="font-semibold text-white text-sm">Due This Week</h3>
          <span className="text-xs text-portal-soft">
            {dueThisWeekTasks.length} {dueThisWeekTasks.length === 1 ? 'task' : 'tasks'}
            {dueThisWeekTasks.length > 10 ? ', showing 10' : ''}
          </span>
        </div>
        {dueDisplay.length === 0 ? (
          <div className="px-5 py-8 text-center text-portal-soft text-sm">
            Nothing due in the next 7 days.
          </div>
        ) : (
          <div>
            {dueDisplay.map(({ day, tasks }) => (
              <div key={day}>
                <div className="px-5 py-2 bg-portal-surface2">
                  <span className="text-xs font-semibold text-portal-soft uppercase tracking-wide">
                    {formatDayLabel(day)}
                  </span>
                </div>
                {tasks.map(({ task, boardName }) => (
                  <div
                    key={task.id}
                    onClick={() => setCurrentView(ToolView.TASKS)}
                    className="px-5 py-2.5 flex items-center justify-between border-t border-white/[0.04] hover:bg-portal-surface2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-600 flex-shrink-0" />
                      <span className="text-sm text-portal-text truncate">{task.title}</span>
                    </div>
                    <span className="text-xs text-portal-soft ml-4 flex-shrink-0">{boardName}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Access */}
      <div>
        <p className="text-xs text-portal-soft font-medium uppercase tracking-wider mb-3">
          Quick Access
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {navShortcuts.map(({ view, label, icon }) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className="bg-portal-surface hover:bg-portal-surface2 border border-white/[0.07] rounded-xl p-3 flex flex-col items-center gap-2 transition-all group cursor-pointer"
            >
              <span className="text-brand-600 group-hover:scale-110 transition-transform block">
                {icon}
              </span>
              <span className="text-xs text-portal-soft group-hover:text-white transition-colors">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
