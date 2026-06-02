import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Flame,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { ToolView, User, ClientBoard, Profile } from '../types';
import { fetchClientBoards, fetchProfiles } from '../services/databaseService';
import { buildDashboardMetrics, ClientRisk, CommandItem, DashboardMetrics, FeedItem, HygieneIssue, PipelineMetric, TaskWithContext, WorkloadRow } from '../services/dashboardMetricsService';
import { supabase } from '../lib/supabaseClient';

interface DashboardProps {
  currentUser: User;
  setCurrentView: (view: ToolView) => void;
}

type KpiTone = 'red' | 'amber' | 'green' | 'blue' | 'brand' | 'slate';

const toneClasses: Record<KpiTone, { text: string; bg: string; border: string; dot: string }> = {
  red: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/25', dot: 'bg-red-500' },
  amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25', dot: 'bg-amber-400' },
  green: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', dot: 'bg-emerald-500' },
  blue: { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/25', dot: 'bg-sky-400' },
  brand: { text: 'text-brand-500', bg: 'bg-brand-500/10', border: 'border-brand-500/25', dot: 'bg-brand-500' },
  slate: { text: 'text-portal-text', bg: 'bg-white/[0.04]', border: 'border-white/[0.07]', dot: 'bg-portal-soft' },
};

const navShortcuts: { view: ToolView; label: string; icon: React.ReactNode }[] = [
  { view: ToolView.TASKS, label: 'Tasks', icon: <ListChecks className="w-4 h-4" /> },
  { view: ToolView.MY_WORK, label: 'My Work', icon: <Target className="w-4 h-4" /> },
  { view: ToolView.TEAM_CHAT, label: 'Team Chat', icon: <MessageSquare className="w-4 h-4" /> },
  { view: ToolView.ECHO_WORKSPACES, label: 'Echo AI', icon: <Bot className="w-4 h-4" /> },
  { view: ToolView.CONTENT_GENERATOR, label: 'Content', icon: <Sparkles className="w-4 h-4" /> },
  { view: ToolView.SITE_AUDIT, label: 'SEO Audit', icon: <BarChart3 className="w-4 h-4" /> },
];

const formatDateLabel = (): string => new Date().toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const formatTime = (date?: Date): string => {
  if (!date) return 'Never';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const greetingFor = (name: string): string => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${name.split(' ')[0]}`;
};

const metricTone = (value: number, warnAt: number, dangerAt: number): KpiTone => {
  if (value >= dangerAt) return 'red';
  if (value >= warnAt) return 'amber';
  return value > 0 ? 'blue' : 'green';
};

const Panel: React.FC<{ title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, subtitle, icon, children, className = '' }) => (
  <section className={`bg-portal-surface rounded-2xl border border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden ${className}`}>
    <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon ? <span className="text-brand-500 flex-shrink-0">{icon}</span> : null}
        <div className="min-w-0">
          <h3 className="font-semibold text-white text-sm truncate">{title}</h3>
          {subtitle ? <p className="text-xs text-portal-soft mt-0.5 truncate">{subtitle}</p> : null}
        </div>
      </div>
    </div>
    {children}
  </section>
);

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  detail: string;
  tone: KpiTone;
  icon: React.ReactNode;
  onClick?: () => void;
}> = ({ label, value, detail, tone, icon, onClick }) => {
  const cls = toneClasses[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-portal-surface rounded-2xl p-4 border ${cls.border} hover:bg-portal-surface2 transition-all group shadow-lg shadow-black/10`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 rounded-xl ${cls.bg} ${cls.text} flex items-center justify-center group-hover:scale-105 transition-transform`}>
          {icon}
        </div>
        <span className={`w-2 h-2 rounded-full ${cls.dot} mt-1`} />
      </div>
      <div className={`text-3xl font-bold tabular-nums mt-3 ${cls.text}`}>{value}</div>
      <div className="text-sm font-medium text-white mt-1">{label}</div>
      <div className="text-xs text-portal-soft mt-1">{detail}</div>
    </button>
  );
};

const ReasonChip: React.FC<{ children: React.ReactNode; tone?: KpiTone }> = ({ children, tone = 'slate' }) => {
  const cls = toneClasses[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls.bg} ${cls.text} border ${cls.border}`}>{children}</span>;
};

type DrilldownFilter = 'overdue' | 'blocked' | 'unassigned' | 'due-week' | 'stale' | 'no-due-date' | 'completed-week' | 'all';
type DrilldownPayload = { boardId?: string; profileId?: string; groupId?: string; taskId?: string; pipelineKey?: string; filter?: DrilldownFilter; label?: string };

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const addDaysIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const taskPayload = (item: TaskWithContext): DrilldownPayload => ({
  boardId: item.boardId,
  groupId: item.groupId,
  taskId: item.task.id,
  filter: item.task.dueDate && item.task.dueDate < todayIso() ? 'overdue' : 'due-week',
  label: item.task.title,
});

const includesAny = (value: string, needles: string[]) => needles.some(needle => value.includes(needle));

const pipelineKeyForTask = (task: TaskWithContext): string => {
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

const CommandList: React.FC<{ items: CommandItem[]; onDrilldown: (payload: DrilldownPayload) => void }> = ({ items, onDrilldown }) => (
  <Panel title="Today's Command List" subtitle="The first clicks, not another spreadsheet" icon={<Target className="w-4 h-4" />} className="lg:col-span-12">
    {items.length === 0 ? (
      <div className="px-5 py-8 text-center text-portal-soft text-sm">Nothing urgent in the command list. Enjoy the five minutes of peace.</div>
    ) : (
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 p-5">
        {items.map((item, index) => {
          const tone = item.tone as KpiTone;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onDrilldown({ boardId: item.boardId, profileId: item.profileId, filter: item.filter, label: item.label })}
              className={`text-left rounded-xl p-4 border ${toneClasses[tone].border} ${toneClasses[tone].bg} hover:bg-portal-surface2 transition-colors`}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className={`w-7 h-7 rounded-lg ${toneClasses[tone].bg} ${toneClasses[tone].text} flex items-center justify-center text-xs font-bold border ${toneClasses[tone].border}`}>{index + 1}</span>
                <span className="text-[10px] text-portal-soft uppercase tracking-wide">Open</span>
              </div>
              <div className="text-sm font-semibold text-white leading-snug">{item.label}</div>
              <p className="text-xs text-portal-soft mt-2 leading-relaxed">{item.detail}</p>
            </button>
          );
        })}
      </div>
    )}
  </Panel>
);

const RiskQueue: React.FC<{ risks: ClientRisk[]; onDrilldown: (payload: DrilldownPayload) => void }> = ({ risks, onDrilldown }) => (
  <Panel title="Needs Attention" subtitle={`${risks.filter(r => r.overdueCount > 0).length} clients with overdue work`} icon={<ShieldAlert className="w-4 h-4" />} className="lg:col-span-5">
    {risks.length === 0 ? (
      <div className="px-5 py-10 text-center text-portal-soft text-sm">No client risk signals. Either excellent work or the data is lying.</div>
    ) : (
      <div className="divide-y divide-white/[0.05] max-h-[520px] overflow-y-auto">
        {risks.slice(0, 12).map(risk => {
          const tone: KpiTone = risk.level === 'Critical' ? 'red' : risk.level === 'High' ? 'amber' : 'blue';
          return (
            <button key={risk.board.id} onClick={() => onDrilldown({ boardId: risk.board.id, filter: risk.overdueCount ? 'overdue' : 'all', label: risk.board.name })} className="w-full px-5 py-3.5 hover:bg-portal-surface2 transition-colors text-left">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${toneClasses[tone].dot} flex-shrink-0`} />
                    <span className="text-sm font-semibold text-white truncate">{risk.board.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {risk.reasons.slice(0, 4).map(reason => <ReasonChip key={reason} tone={reason.includes('overdue') ? 'red' : reason.includes('blocked') ? 'amber' : 'slate'}>{reason}</ReasonChip>)}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xs font-bold ${toneClasses[tone].text}`}>{risk.level}</div>
                  <div className="text-[10px] text-portal-soft mt-1">Risk {risk.score}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </Panel>
);

const PipelineHealth: React.FC<{ pipelines: PipelineMetric[]; onDrilldown: (payload: DrilldownPayload) => void }> = ({ pipelines, onDrilldown }) => (
  <Panel title="Pipeline Health" subtitle="Content, technical, reporting and links" icon={<Activity className="w-4 h-4" />} className="lg:col-span-4">
    <div className="p-5 space-y-3">
      {pipelines.map(pipeline => {
        const total = Math.max(pipeline.open, 1);
        const overduePct = Math.min(100, Math.round((pipeline.overdue / total) * 100));
        const tone = pipeline.overdue > 20 ? 'red' : pipeline.overdue > 5 ? 'amber' : 'green';
        return (
          <button
            key={pipeline.key}
            type="button"
            onClick={() => onDrilldown({ boardId: pipeline.sampleBoardId, pipelineKey: pipeline.key, filter: pipeline.overdue ? 'overdue' : 'all', label: pipeline.label })}
            className="w-full text-left bg-portal-surface2/60 rounded-xl p-3 border border-white/[0.05] hover:border-brand-500/30 hover:bg-portal-surface2 transition-all"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm font-semibold text-white">{pipeline.label}</span>
              <span className={`text-xs font-bold ${toneClasses[tone].text}`}>{pipeline.overdue} overdue</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${toneClasses[tone].dot}`} style={{ width: `${overduePct}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3 text-[11px] text-portal-soft">
              <span><strong className="text-white">{pipeline.open}</strong> open</span>
              <span><strong className="text-white">{pipeline.blocked}</strong> blocked</span>
              <span><strong className="text-white">{pipeline.dueThisWeek}</strong> due</span>
              <span><strong className="text-white">{pipeline.completedThisWeek}</strong> done</span>
            </div>
          </button>
        );
      })}
    </div>
  </Panel>
);

const AgencyFeed: React.FC<{ items: FeedItem[]; onDrilldown: (payload: DrilldownPayload) => void }> = ({ items, onDrilldown }) => (
  <Panel title="Agency Feed" subtitle="Latest operational signals" icon={<Zap className="w-4 h-4" />} className="lg:col-span-3">
    {items.length === 0 ? (
      <div className="px-5 py-10 text-center text-portal-soft text-sm">Quiet. Too quiet.</div>
    ) : (
      <div className="divide-y divide-white/[0.05] max-h-[520px] overflow-y-auto">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onDrilldown({ boardId: item.boardId, groupId: item.groupId, taskId: item.taskId, filter: item.filter || 'all', label: item.title })}
            className="w-full text-left px-5 py-3 flex gap-3 hover:bg-portal-surface2 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${toneClasses[item.tone].dot}`} />
            <div className="min-w-0">
              <div className="text-sm text-white font-medium leading-snug">{item.title}</div>
              <div className="text-xs text-portal-soft mt-1 leading-snug">{item.detail}</div>
            </div>
          </button>
        ))}
      </div>
    )}
  </Panel>
);

const TeamCapacity: React.FC<{ rows: WorkloadRow[]; onDrilldown: (payload: DrilldownPayload) => void }> = ({ rows, onDrilldown }) => {
  const maxLoad = rows.reduce((max, row) => Math.max(max, row.openCount), 1);
  return (
    <Panel title="Team Accountability" subtitle="Worst queues first: overdue, blocked and high-priority work" icon={<Users className="w-4 h-4" />} className="lg:col-span-6">
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-portal-soft text-sm">No assigned workload found.</div>
      ) : (
        <div className="divide-y divide-white/[0.05] max-h-[460px] overflow-y-auto">
          {rows.slice(0, 12).map(row => {
            const barPct = Math.round((row.openCount / maxLoad) * 100);
            const tone: KpiTone = row.risk === 'Overloaded' ? 'red' : row.risk === 'Busy' ? 'amber' : 'green';
            return (
              <button key={row.profile.id} onClick={() => onDrilldown({ boardId: row.sampleBoardId, profileId: row.profile.id, filter: row.overdueCount ? 'overdue' : row.blockedCount ? 'blocked' : row.dueThisWeekCount ? 'due-week' : 'all', label: row.profile.full_name || row.profile.email || 'Team Member' })} className="w-full px-5 py-3.5 text-left hover:bg-portal-surface2 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{row.profile.full_name || row.profile.email || 'Team Member'}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <ReasonChip tone="blue">{row.openCount} open</ReasonChip>
                      <ReasonChip tone={row.overdueCount ? 'red' : 'green'}>{row.overdueCount} overdue</ReasonChip>
                      <ReasonChip tone="brand">{row.dueThisWeekCount} due</ReasonChip>
                      <ReasonChip tone="amber">{row.blockedCount} blocked</ReasonChip>
                      <ReasonChip tone="green">{row.completedThisWeek} done</ReasonChip>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-bold ${toneClasses[tone].text}`}>{row.risk}</span>
                    <div className="text-[10px] text-portal-soft mt-1">Score {row.accountabilityScore}</div>
                  </div>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${toneClasses[tone].dot} transition-all duration-500`} style={{ width: `${barPct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

const StaleClientsPanel: React.FC<{ clients: ClientRisk[]; onDrilldown: (payload: DrilldownPayload) => void }> = ({ clients, onDrilldown }) => (
  <Panel title="Stale Clients" subtitle="Boards with open work but weak movement" icon={<Clock3 className="w-4 h-4" />} className="lg:col-span-3">
    {clients.length === 0 ? (
      <div className="px-5 py-10 text-center text-portal-soft text-sm">No stale clients found.</div>
    ) : (
      <div className="divide-y divide-white/[0.05] max-h-[360px] overflow-y-auto">
        {clients.slice(0, 8).map(client => (
          <button key={client.board.id} onClick={() => onDrilldown({ boardId: client.board.id, filter: 'stale', label: client.board.name })} className="w-full px-5 py-3.5 text-left hover:bg-portal-surface2 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{client.board.name}</div>
                <div className="text-xs text-portal-soft mt-1 truncate">{client.reasons.slice(0, 2).join(' · ')}</div>
              </div>
              <ReasonChip tone={client.staleDays && client.staleDays > 21 ? 'red' : 'blue'}>{client.openCount} open</ReasonChip>
            </div>
          </button>
        ))}
      </div>
    )}
  </Panel>
);

const HygienePanel: React.FC<{ issues: HygieneIssue[]; onDrilldown: (payload: DrilldownPayload) => void }> = ({ issues, onDrilldown }) => (
  <Panel title="Data Hygiene" subtitle="Messy data that makes planning harder" icon={<Database className="w-4 h-4" />} className="lg:col-span-3">
    {issues.length === 0 ? (
      <div className="px-5 py-10 text-center text-portal-soft text-sm">No obvious hygiene issues found.</div>
    ) : (
      <div className="p-5 space-y-3">
        {issues.map(issue => {
          const tone = issue.severity === 'red' ? 'red' : issue.severity === 'amber' ? 'amber' : 'blue';
          return (
            <button
              key={issue.id}
              type="button"
              onClick={() => onDrilldown({ boardId: issue.sampleBoardId, filter: issue.id === 'unassigned' ? 'unassigned' : issue.id === 'blocked' ? 'blocked' : issue.id === 'no-due-date' ? 'no-due-date' : 'all', label: issue.label })}
              className={`w-full text-left rounded-xl p-3 border ${toneClasses[tone].border} ${toneClasses[tone].bg} hover:bg-portal-surface2 transition-colors`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{issue.label}</span>
                <span className={`text-lg font-bold tabular-nums ${toneClasses[tone].text}`}>{issue.count}</span>
              </div>
              <p className="text-xs text-portal-soft mt-1">{issue.detail}</p>
            </button>
          );
        })}
      </div>
    )}
  </Panel>
);

const AiBriefing: React.FC<{ briefing: string[] }> = ({ briefing }) => (
  <Panel title="Echo Briefing" subtitle="What needs dealing with first" icon={<Sparkles className="w-4 h-4" />} className="lg:col-span-3">
    <div className="p-5 space-y-3">
      {briefing.map((line, index) => (
        <div key={line} className="flex gap-3">
          <span className="w-6 h-6 rounded-lg bg-brand-500/15 text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{index + 1}</span>
          <p className="text-sm text-portal-text leading-relaxed">{line}</p>
        </div>
      ))}
    </div>
  </Panel>
);

const profileLabel = (profile?: Profile): string => profile?.full_name || profile?.email || 'Unassigned';

const assigneeLabels = (task: TaskWithContext, profileMap: Map<string, Profile>): string => {
  if (!task.assigneeIds.length) return 'Unassigned';
  return task.assigneeIds.map(id => profileLabel(profileMap.get(id))).join(', ');
};

const taskMatchesDrilldown = (task: TaskWithContext, payload: DrilldownPayload, staleBoardIds: Set<string>): boolean => {
  const today = todayIso();
  const weekEnd = addDaysIso(7);
  const weekStart = addDaysIso(-7);

  if (payload.taskId && task.task.id !== payload.taskId) return false;
  if (payload.boardId && task.boardId !== payload.boardId) return false;
  if (payload.groupId && task.groupId !== payload.groupId) return false;
  if (payload.profileId && !task.assigneeIds.includes(payload.profileId)) return false;
  if (payload.pipelineKey && pipelineKeyForTask(task) !== payload.pipelineKey) return false;

  switch (payload.filter || 'all') {
    case 'overdue':
      return !task.isCompleted && !!task.task.dueDate && task.task.dueDate < today;
    case 'blocked':
      return !task.isCompleted && isBlockedTask(task);
    case 'unassigned':
      return !task.isCompleted && task.assigneeIds.length === 0;
    case 'due-week':
      return !task.isCompleted && !!task.task.dueDate && task.task.dueDate >= today && task.task.dueDate <= weekEnd;
    case 'stale':
      return !task.isCompleted && staleBoardIds.has(task.boardId);
    case 'no-due-date':
      return !task.isCompleted && !task.task.dueDate;
    case 'completed-week':
      return task.isCompleted && !!task.task.dueDate && task.task.dueDate >= weekStart && task.task.dueDate <= today;
    case 'all':
    default:
      return !task.isCompleted || !!payload.taskId;
  }
};

const sortDrilldownTasks = (a: TaskWithContext, b: TaskWithContext): number => {
  const today = todayIso();
  const aOverdue = !!a.task.dueDate && a.task.dueDate < today;
  const bOverdue = !!b.task.dueDate && b.task.dueDate < today;
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  if (a.isHighPriority !== b.isHighPriority) return a.isHighPriority ? -1 : 1;
  return (a.task.dueDate || '9999-12-31').localeCompare(b.task.dueDate || '9999-12-31') || a.boardName.localeCompare(b.boardName);
};

const DrilldownPanel: React.FC<{
  payload: DrilldownPayload;
  tasks: TaskWithContext[];
  profiles: Profile[];
  onClose: () => void;
  onOpenTask: (task: TaskWithContext) => void;
}> = ({ payload, tasks, profiles, onClose, onOpenTask }) => {
  const profileMap = useMemo(() => new Map(profiles.map(profile => [profile.id, profile])), [profiles]);
  const affectedClients = new Set(tasks.map(task => task.boardId)).size;
  const overdueCount = tasks.filter(task => !!task.task.dueDate && task.task.dueDate < todayIso() && !task.isCompleted).length;
  const blockedCount = tasks.filter(isBlockedTask).length;

  return (
    <section className="bg-portal-surface rounded-2xl border border-brand-500/25 shadow-xl shadow-black/20 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.07] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">Cockpit drilldown</span>
            <span className="text-xs text-portal-soft">Standalone view, not a client board jump</span>
          </div>
          <h3 className="text-lg font-bold text-white truncate">{payload.label || 'Filtered tasks'}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReasonChip tone="brand">{tasks.length} task{tasks.length === 1 ? '' : 's'}</ReasonChip>
          <ReasonChip tone="blue">{affectedClients} client{affectedClients === 1 ? '' : 's'}</ReasonChip>
          <ReasonChip tone={overdueCount ? 'red' : 'green'}>{overdueCount} overdue</ReasonChip>
          <ReasonChip tone={blockedCount ? 'amber' : 'green'}>{blockedCount} blocked</ReasonChip>
          <button type="button" onClick={onClose} className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-portal-surface2 px-3 py-1.5 text-xs text-portal-soft hover:text-white hover:border-brand-500/30 transition-colors">
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="px-5 py-10 text-center text-portal-soft text-sm">No matching tasks for this signal.</div>
      ) : (
        <div className="divide-y divide-white/[0.05] max-h-[620px] overflow-y-auto">
          {tasks.slice(0, 150).map(task => {
            const dueTone: KpiTone = task.task.dueDate && task.task.dueDate < todayIso() ? 'red' : task.task.dueDate ? 'brand' : 'slate';
            return (
              <div
                key={`${task.boardId}-${task.groupId}-${task.task.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpenTask(task)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onOpenTask(task);
                }}
                className="w-full px-5 py-4 text-left hover:bg-portal-surface2/70 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-inset cursor-pointer"
                title={`Open ${task.task.title}`}
              >
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-brand-400">{task.boardName}</span>
                      <span className="text-[10px] text-portal-soft">/</span>
                      <span className="text-xs text-portal-soft">{task.groupTitle}</span>
                    </div>
                    <div className="text-sm font-semibold text-white leading-snug">{task.task.title}</div>
                    {task.task.description ? <p className="text-xs text-portal-soft leading-relaxed mt-1 line-clamp-2">{task.task.description}</p> : null}
                    {(task.task.worksheet || task.task.clientSheet || (task.task.attachments && task.task.attachments.length > 0)) ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {task.task.worksheet ? (
                          <a href={task.task.worksheet} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300">
                            <ExternalLink className="w-3 h-3" /> Worksheet
                          </a>
                        ) : null}
                        {task.task.clientSheet ? (
                          <a href={task.task.clientSheet} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300">
                            <ExternalLink className="w-3 h-3" /> Client sheet
                          </a>
                        ) : null}
                        {task.task.attachments && task.task.attachments.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-portal-soft">
                            <Paperclip className="w-3 h-3" /> {task.task.attachments.length} attachment{task.task.attachments.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 xl:justify-end xl:min-w-[360px]">
                    <ReasonChip tone="blue">{assigneeLabels(task, profileMap)}</ReasonChip>
                    <ReasonChip tone={dueTone}>{task.task.dueDate || 'No due date'}</ReasonChip>
                    <ReasonChip tone={task.isHighPriority ? 'red' : 'slate'}>{task.priorityLabel}</ReasonChip>
                    <ReasonChip tone={isBlockedTask(task) ? 'amber' : 'slate'}>{task.statusLabel}</ReasonChip>
                  </div>
                </div>
              </div>
            );
          })}
          {tasks.length > 150 ? <div className="px-5 py-3 text-xs text-portal-soft bg-portal-surface2/50">Showing first 150 of {tasks.length}. Tighten the signal if this is too noisy.</div> : null}
        </div>
      )}
    </section>
  );
};

const DueSoonPanel: React.FC<{ metrics: DashboardMetrics; onDrilldown: (payload: DrilldownPayload) => void }> = ({ metrics, onDrilldown }) => (
  <Panel title="Due This Week" subtitle={`${metrics.dueThisWeekTasks.length} open tasks due in the next 7 days`} icon={<Clock3 className="w-4 h-4" />} className="lg:col-span-6">
    {metrics.dueThisWeekTasks.length === 0 ? (
      <div className="px-5 py-10 text-center text-portal-soft text-sm">Nothing due this week. A rare and beautiful creature.</div>
    ) : (
      <div className="divide-y divide-white/[0.05] max-h-[360px] overflow-y-auto">
        {metrics.dueThisWeekTasks.slice(0, 12).map(item => (
          <button key={`${item.boardId}-${item.task.id}`} onClick={() => onDrilldown(taskPayload(item))} className="w-full px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-portal-surface2 transition-colors">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{item.task.title}</div>
              <div className="text-xs text-portal-soft mt-1 truncate">{item.boardName} · {item.groupTitle}</div>
            </div>
            <span className="text-xs text-brand-400 font-semibold flex-shrink-0">{item.task.dueDate}</span>
          </button>
        ))}
      </div>
    )}
  </Panel>
);

const Dashboard: React.FC<DashboardProps> = ({ currentUser, setCurrentView }) => {
  const [boards, setBoards] = useState<ClientBoard[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();
  const [activeDrilldown, setActiveDrilldown] = useState<DrilldownPayload | null>(null);
  const lastDashboardRefreshRef = useRef(0);

  const loadDashboard = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [nextBoards, nextProfiles] = await Promise.all([fetchClientBoards(), fetchProfiles()]);
      setBoards(nextBoards);
      setProfiles(nextProfiles);
      const now = new Date();
      setLastUpdated(now);
      lastDashboardRefreshRef.current = now.getTime();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Dashboard data failed to load';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  useEffect(() => {
    let debounceTimer: number | null = null;
    const queueDashboardRefresh = () => {
      // Batch noisy board/profile events into one full board_data read.
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => loadDashboard(true), 5000);
    };

    const channel = supabase
      .channel('dashboard-ops-cockpit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_boards' }, queueDashboardRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, queueDashboardRefresh)
      .subscribe();

    // Realtime is primary. A one-minute safety refresh keeps the cockpit breathing if the socket drops.
    const interval = window.setInterval(() => loadDashboard(true), 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastDashboardRefreshRef.current > 120000) {
        loadDashboard(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadDashboard]);

  const metrics = useMemo(() => buildDashboardMetrics(boards, profiles), [boards, profiles]);
  const staleBoardIds = useMemo(() => new Set(metrics.staleClients.map(client => client.board.id)), [metrics.staleClients]);
  const drilldownTasks = useMemo(() => {
    if (!activeDrilldown) return [];
    return metrics.allTasks
      .filter(task => taskMatchesDrilldown(task, activeDrilldown, staleBoardIds))
      .sort(sortDrilldownTasks);
  }, [activeDrilldown, metrics.allTasks, staleBoardIds]);

  const openTasksView = (payload: DrilldownPayload = { filter: 'all' }) => {
    setActiveDrilldown(payload);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const openExactTask = (task: TaskWithContext) => {
    const linkData = {
      taskId: task.task.id,
      boardId: task.boardId,
      groupId: task.groupId,
    };

    try {
      localStorage.setItem('openTaskModal', JSON.stringify(linkData));
    } catch (e) {
      console.error('[Dashboard] Failed to store task deep link:', e);
    }

    setCurrentView(ToolView.TASKS);
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('openTaskModal', { detail: linkData }));
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-portal-soft text-base">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          Building the operations cockpit...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2.5 py-1 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              Live Ops Cockpit
            </span>
            {refreshing ? <span className="text-xs text-portal-soft flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> refreshing</span> : null}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">{greetingFor(currentUser.name)}</h2>
          <p className="text-portal-soft text-sm mt-1">{formatDateLabel()} · Last updated {formatTime(lastUpdated)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {navShortcuts.map(({ view, label, icon }) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className="bg-portal-surface hover:bg-portal-surface2 border border-white/[0.07] rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-portal-soft hover:text-white transition-all"
            >
              <span className="text-brand-500">{icon}</span>
              {label}
            </button>
          ))}
          <button onClick={() => loadDashboard(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-semibold transition-colors">
            <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-300 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      ) : null}

      {activeDrilldown ? (
        <DrilldownPanel payload={activeDrilldown} tasks={drilldownTasks} profiles={profiles} onClose={() => setActiveDrilldown(null)} onOpenTask={openExactTask} />
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Active Clients" value={metrics.boards.length} detail="Live client boards" tone="brand" icon={<Users className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'all', label: 'Active clients' })} />
        <KpiCard label="Open Tasks" value={metrics.openTasks.length} detail="Excludes Done groups and done statuses" tone="blue" icon={<ListChecks className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'all', label: 'Open tasks' })} />
        <KpiCard label="Overdue" value={metrics.overdueTasks.length} detail={`${metrics.clientRisks.filter(r => r.overdueCount > 0).length} affected clients`} tone={metricTone(metrics.overdueTasks.length, 25, 100)} icon={<Flame className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'overdue', label: 'Overdue tasks' })} />
        <KpiCard label="Due This Week" value={metrics.dueThisWeekTasks.length} detail={`${metrics.dueTodayTasks.length} due today`} tone="brand" icon={<Clock3 className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'due-week', label: 'Due this week' })} />
        <KpiCard label="Blocked" value={metrics.blockedTasks.length} detail="Waiting, stuck or blocked language" tone={metricTone(metrics.blockedTasks.length, 10, 30)} icon={<AlertTriangle className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'blocked', label: 'Blocked tasks' })} />
        <KpiCard label="Completed" value={metrics.completedThisWeekTasks.length} detail="Completed this week" tone="green" icon={<CheckCircle2 className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'completed-week', label: 'Completed this week' })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <CommandList items={metrics.commandItems} onDrilldown={openTasksView} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <RiskQueue risks={metrics.clientRisks.filter(r => r.overdueCount > 0 || r.level !== 'Watch').slice(0, 20)} onDrilldown={openTasksView} />
        <PipelineHealth pipelines={metrics.pipelineMetrics} onDrilldown={openTasksView} />
        <AgencyFeed items={metrics.feedItems} onDrilldown={openTasksView} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <TeamCapacity rows={metrics.workloadRows} onDrilldown={openTasksView} />
        <AiBriefing briefing={metrics.briefing} />
        <StaleClientsPanel clients={metrics.staleClients} onDrilldown={openTasksView} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <DueSoonPanel metrics={metrics} onDrilldown={openTasksView} />
        <HygienePanel issues={metrics.hygieneIssues} onDrilldown={openTasksView} />
        <Panel title="Control Notes" subtitle="How to use this cockpit" icon={<Target className="w-4 h-4" />} className="lg:col-span-6">
          <div className="p-5 grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-portal-surface2/60 border border-white/[0.05] p-4">
              <div className="text-sm font-semibold text-white mb-1">Start with risk</div>
              <p className="text-xs text-portal-soft leading-relaxed">Use Needs Attention as the daily hit list. It ranks clients by overdue, blocked, unassigned and messy work.</p>
            </div>
            <div className="rounded-xl bg-portal-surface2/60 border border-white/[0.05] p-4">
              <div className="text-sm font-semibold text-white mb-1">Trust the counts</div>
              <p className="text-xs text-portal-soft leading-relaxed">Done groups and green/completed statuses are excluded, so zombie tasks do not poison the totals.</p>
            </div>
            <div className="rounded-xl bg-portal-surface2/60 border border-white/[0.05] p-4">
              <div className="text-sm font-semibold text-white mb-1">Watch hygiene</div>
              <p className="text-xs text-portal-soft leading-relaxed">No due date and no owner are planning debt. Fix those before wondering why the board feels haunted.</p>
            </div>
            <div className="rounded-xl bg-portal-surface2/60 border border-white/[0.05] p-4">
              <div className="text-sm font-semibold text-white mb-1">Live by default</div>
              <p className="text-xs text-portal-soft leading-relaxed">Supabase realtime plus a one-minute safety refresh keeps the cockpit moving without manual reloads.</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default Dashboard;
