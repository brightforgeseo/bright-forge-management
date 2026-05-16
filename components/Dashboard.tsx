import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  Zap,
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

type DrilldownFilter = 'overdue' | 'blocked' | 'unassigned' | 'due-week' | 'stale' | 'all';
type DrilldownPayload = { boardId?: string; profileId?: string; filter?: DrilldownFilter; label?: string };

const taskPayload = (item: TaskWithContext): DrilldownPayload => ({
  boardId: item.boardId,
  filter: item.task.dueDate && item.task.dueDate < new Date().toISOString().slice(0, 10) ? 'overdue' : 'due-week',
  label: item.task.title,
});

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

const PipelineHealth: React.FC<{ pipelines: PipelineMetric[] }> = ({ pipelines }) => (
  <Panel title="Pipeline Health" subtitle="Content, technical, reporting and links" icon={<Activity className="w-4 h-4" />} className="lg:col-span-4">
    <div className="p-5 space-y-3">
      {pipelines.map(pipeline => {
        const total = Math.max(pipeline.open, 1);
        const overduePct = Math.min(100, Math.round((pipeline.overdue / total) * 100));
        const tone = pipeline.overdue > 20 ? 'red' : pipeline.overdue > 5 ? 'amber' : 'green';
        return (
          <div key={pipeline.key} className="bg-portal-surface2/60 rounded-xl p-3 border border-white/[0.05]">
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
          </div>
        );
      })}
    </div>
  </Panel>
);

const AgencyFeed: React.FC<{ items: FeedItem[] }> = ({ items }) => (
  <Panel title="Agency Feed" subtitle="Latest operational signals" icon={<Zap className="w-4 h-4" />} className="lg:col-span-3">
    {items.length === 0 ? (
      <div className="px-5 py-10 text-center text-portal-soft text-sm">Quiet. Too quiet.</div>
    ) : (
      <div className="divide-y divide-white/[0.05] max-h-[520px] overflow-y-auto">
        {items.map(item => (
          <div key={item.id} className="px-5 py-3 flex gap-3">
            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${toneClasses[item.tone].dot}`} />
            <div className="min-w-0">
              <div className="text-sm text-white font-medium leading-snug">{item.title}</div>
              <div className="text-xs text-portal-soft mt-1 leading-snug">{item.detail}</div>
            </div>
          </div>
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
              <button key={row.profile.id} onClick={() => onDrilldown({ profileId: row.profile.id, filter: 'overdue', label: row.profile.full_name || row.profile.email || 'Team Member' })} className="w-full px-5 py-3.5 text-left hover:bg-portal-surface2 transition-colors">
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

const HygienePanel: React.FC<{ issues: HygieneIssue[] }> = ({ issues }) => (
  <Panel title="Data Hygiene" subtitle="Messy data that makes planning harder" icon={<Database className="w-4 h-4" />} className="lg:col-span-3">
    {issues.length === 0 ? (
      <div className="px-5 py-10 text-center text-portal-soft text-sm">No obvious hygiene issues found.</div>
    ) : (
      <div className="p-5 space-y-3">
        {issues.map(issue => {
          const tone = issue.severity === 'red' ? 'red' : issue.severity === 'amber' ? 'amber' : 'blue';
          return (
            <div key={issue.id} className={`rounded-xl p-3 border ${toneClasses[tone].border} ${toneClasses[tone].bg}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{issue.label}</span>
                <span className={`text-lg font-bold tabular-nums ${toneClasses[tone].text}`}>{issue.count}</span>
              </div>
              <p className="text-xs text-portal-soft mt-1">{issue.detail}</p>
            </div>
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

  const loadDashboard = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [nextBoards, nextProfiles] = await Promise.all([fetchClientBoards(), fetchProfiles()]);
      setBoards(nextBoards);
      setProfiles(nextProfiles);
      setLastUpdated(new Date());
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
    const channel = supabase
      .channel('dashboard-ops-cockpit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_boards' }, () => loadDashboard(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadDashboard(true))
      .subscribe();

    const interval = window.setInterval(() => loadDashboard(true), 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadDashboard(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadDashboard]);

  const metrics = useMemo(() => buildDashboardMetrics(boards, profiles), [boards, profiles]);
  const openTasksView = (payload: DrilldownPayload = { filter: 'all' }) => {
    localStorage.setItem('dashboardTaskDrilldown', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('dashboardTaskDrilldown'));
    setCurrentView(ToolView.TASKS);
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

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Active Clients" value={metrics.boards.length} detail="Live client boards" tone="brand" icon={<Users className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'all' })} />
        <KpiCard label="Open Tasks" value={metrics.openTasks.length} detail="Excludes Done groups and done statuses" tone="blue" icon={<ListChecks className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'all' })} />
        <KpiCard label="Overdue" value={metrics.overdueTasks.length} detail={`${metrics.clientRisks.filter(r => r.overdueCount > 0).length} affected clients`} tone={metricTone(metrics.overdueTasks.length, 25, 100)} icon={<Flame className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'overdue' })} />
        <KpiCard label="Due This Week" value={metrics.dueThisWeekTasks.length} detail={`${metrics.dueTodayTasks.length} due today`} tone="brand" icon={<Clock3 className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'due-week' })} />
        <KpiCard label="Blocked" value={metrics.blockedTasks.length} detail="Waiting, stuck or blocked language" tone={metricTone(metrics.blockedTasks.length, 10, 30)} icon={<AlertTriangle className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'blocked' })} />
        <KpiCard label="Completed" value={metrics.completedThisWeekTasks.length} detail="Completed this week" tone="green" icon={<CheckCircle2 className="w-5 h-5" />} onClick={() => openTasksView({ filter: 'all' })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <CommandList items={metrics.commandItems} onDrilldown={openTasksView} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <RiskQueue risks={metrics.clientRisks.filter(r => r.overdueCount > 0 || r.level !== 'Watch').slice(0, 20)} onDrilldown={openTasksView} />
        <PipelineHealth pipelines={metrics.pipelineMetrics} />
        <AgencyFeed items={metrics.feedItems} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <TeamCapacity rows={metrics.workloadRows} onDrilldown={openTasksView} />
        <AiBriefing briefing={metrics.briefing} />
        <StaleClientsPanel clients={metrics.staleClients} onDrilldown={openTasksView} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <DueSoonPanel metrics={metrics} onDrilldown={openTasksView} />
        <HygienePanel issues={metrics.hygieneIssues} />
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
