import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  FileWarning,
  Gauge,
  Layers3,
  Loader2,
  Radio,
  RefreshCcw,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { ClientBoard, Profile, ToolView, User } from '../types';
import { fetchClientBoards, fetchProfiles } from '../services/databaseService';
import { buildDashboardMetrics, ClientRisk, TaskWithContext, WorkloadRow } from '../services/dashboardMetricsService';
import { buildBusinessOsSnapshot, hasLinkedEvidence, isBenBusinessOsUser } from '../services/businessOsModel.mjs';
import { supabase } from '../lib/supabaseClient';

interface BusinessOSProps {
  currentUser: User;
  setCurrentView: (view: ToolView) => void;
}

type ConnectionState = {
  label: string;
  detail: string;
  state: 'online' | 'checking' | 'blocked';
};

const formatTime = (value?: Date) => value
  ? value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  : 'Not yet';

const dueLabel = (task: TaskWithContext) => {
  if (!task.task.dueDate) return 'No due date';
  const today = new Date().toISOString().slice(0, 10);
  if (task.task.dueDate < today) return `Overdue ${task.task.dueDate}`;
  if (task.task.dueDate === today) return 'Due today';
  return `Due ${task.task.dueDate}`;
};

const taskTone = (task: TaskWithContext) => {
  if (task.task.dueDate && task.task.dueDate < new Date().toISOString().slice(0, 10)) return 'text-red-300 border-red-500/25 bg-red-500/5';
  if (task.isHighPriority) return 'text-amber-300 border-amber-500/25 bg-amber-500/5';
  return 'text-portal-soft border-white/[0.07] bg-white/[0.02]';
};

const MetricCell: React.FC<{
  label: string;
  value: number;
  detail: string;
  tone: 'red' | 'amber' | 'orange' | 'blue' | 'green';
  icon: React.ReactNode;
}> = ({ label, value, detail, tone, icon }) => {
  const colours = {
    red: 'text-red-300 bg-red-500/10 border-red-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    orange: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    blue: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  }[tone];

  return (
    <div className="min-w-0 border-r border-white/[0.07] last:border-r-0 px-4 py-4 md:px-5">
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex h-8 w-8 items-center justify-center border ${colours}`}>{icon}</span>
        <span className={`text-3xl font-semibold tabular-nums ${colours.split(' ')[0]}`}>{value}</span>
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-white">{label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-portal-soft">{detail}</div>
    </div>
  );
};

const TaskRow: React.FC<{
  task: TaskWithContext;
  actionLabel?: string;
  onOpen: (task: TaskWithContext) => void;
}> = ({ task, actionLabel = 'Open task', onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(task)}
    className="group w-full border-b border-white/[0.06] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.035] md:px-5"
  >
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-400">
          <span>{task.boardName}</span>
          <span className="text-white/20">/</span>
          <span className="text-portal-soft">{task.groupTitle}</span>
        </div>
        <div className="mt-1.5 text-sm font-medium leading-snug text-white">{task.task.title}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={`border px-2 py-0.5 text-[10px] font-medium ${taskTone(task)}`}>{dueLabel(task)}</span>
          <span className="border border-white/[0.07] bg-white/[0.025] px-2 py-0.5 text-[10px] text-portal-soft">{task.statusLabel}</span>
          {hasLinkedEvidence(task.task) ? <span className="border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[10px] text-emerald-300">Linked evidence</span> : null}
        </div>
      </div>
      <span className="mt-1 flex flex-shrink-0 items-center gap-1 text-[11px] text-portal-soft transition-colors group-hover:text-brand-300">
        {actionLabel}<ArrowRight className="h-3.5 w-3.5" />
      </span>
    </div>
  </button>
);

const SectionHeader: React.FC<{ eyebrow: string; title: string; count?: number; detail?: string }> = ({ eyebrow, title, count, detail }) => (
  <div className="flex flex-col gap-2 border-b border-white/[0.07] px-4 py-4 md:flex-row md:items-end md:justify-between md:px-5">
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-400">{eyebrow}</div>
      <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
    </div>
    <div className="flex items-center gap-2">
      {detail ? <span className="text-[11px] text-portal-soft">{detail}</span> : null}
      {typeof count === 'number' ? <span className="border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs font-semibold tabular-nums text-white">{count}</span> : null}
    </div>
  </div>
);

const ConnectionRow: React.FC<{ item: ConnectionState }> = ({ item }) => {
  const state = {
    online: { dot: 'bg-emerald-400', text: 'Online', colour: 'text-emerald-300' },
    checking: { dot: 'bg-amber-400 animate-pulse', text: 'Checking', colour: 'text-amber-300' },
    blocked: { dot: 'bg-red-400', text: 'Unavailable', colour: 'text-red-300' },
  }[item.state];
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:px-5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{item.label}</div>
        <div className="mt-0.5 truncate text-[11px] text-portal-soft">{item.detail}</div>
      </div>
      <span className={`flex flex-shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${state.colour}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />{state.text}
      </span>
    </div>
  );
};

const WorkloadLine: React.FC<{ row: WorkloadRow }> = ({ row }) => {
  const total = Math.max(row.openCount, 1);
  const overdueWidth = Math.min(100, Math.round((row.overdueCount / total) * 100));
  const name = row.profile.full_name || row.profile.email || 'Team member';
  return (
    <div className="grid gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(150px,1fr)_2fr_auto] md:items-center md:px-5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{name}</div>
        <div className="mt-0.5 text-[11px] text-portal-soft">{row.openCount} open, {row.completedThisWeek} completed this week</div>
      </div>
      <div>
        <div className="h-1.5 overflow-hidden bg-white/[0.06]">
          <div className="h-full bg-red-400" style={{ width: `${overdueWidth}%` }} />
        </div>
        <div className="mt-1 flex gap-3 text-[10px] text-portal-soft">
          <span>{row.overdueCount} overdue</span>
          <span>{row.blockedCount} blocked</span>
          <span>{row.dueThisWeekCount} due</span>
        </div>
      </div>
      <span className={`justify-self-start border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] md:justify-self-end ${
        row.risk === 'Overloaded' ? 'border-red-500/25 bg-red-500/5 text-red-300' : row.risk === 'Busy' ? 'border-amber-500/25 bg-amber-500/5 text-amber-300' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
      }`}>{row.risk}</span>
    </div>
  );
};

const RiskLine: React.FC<{ risk: ClientRisk; onOpen: (risk: ClientRisk) => void }> = ({ risk, onOpen }) => (
  <button type="button" onClick={() => onOpen(risk)} className="group grid w-full gap-3 border-b border-white/[0.06] px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.035] md:grid-cols-[minmax(180px,1fr)_2fr_auto] md:items-center md:px-5">
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-white">{risk.board.name}</div>
      <div className="mt-0.5 text-[11px] text-portal-soft">{risk.openCount} open tasks</div>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {risk.reasons.slice(0, 4).map(reason => <span key={reason} className="border border-white/[0.07] bg-white/[0.025] px-2 py-0.5 text-[10px] text-portal-soft">{reason}</span>)}
    </div>
    <div className="flex items-center gap-2 md:justify-end">
      <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${risk.level === 'Critical' ? 'text-red-300' : risk.level === 'High' ? 'text-amber-300' : 'text-sky-300'}`}>{risk.level}</span>
      <ArrowRight className="h-3.5 w-3.5 text-portal-soft group-hover:text-brand-300" />
    </div>
  </button>
);

const BusinessOSContent: React.FC<BusinessOSProps> = ({ currentUser, setCurrentView }) => {
  const [boards, setBoards] = useState<ClientBoard[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>();
  const [realtimeState, setRealtimeState] = useState<ConnectionState['state']>('checking');
  const [bridgeState, setBridgeState] = useState<ConnectionState['state']>('checking');
  const [portalVersion, setPortalVersion] = useState('Checking');
  const lastRefreshRef = useRef(0);
  const loadRequestRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, []);

  const load = useCallback(async (background = false) => {
    if (!isMountedRef.current) return;
    const requestId = ++loadRequestRef.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [nextBoards, nextProfiles] = await Promise.all([fetchClientBoards(), fetchProfiles()]);
      if (!isMountedRef.current || requestId !== loadRequestRef.current) return;
      setBoards(nextBoards);
      setProfiles(nextProfiles);
      const now = new Date();
      setLastUpdated(now);
      lastRefreshRef.current = now.getTime();
    } catch (caught) {
      if (!isMountedRef.current || requestId !== loadRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Portal operating data could not be loaded');
    } finally {
      if (isMountedRef.current && requestId === loadRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch('/bridge/health', { cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok) throw new Error('Bridge did not report OK');
        if (active) setBridgeState('online');
      }),
      fetch('/version', { cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error(`Version HTTP ${response.status}`);
        const payload = await response.json();
        if (active) setPortalVersion(payload?.version || 'Unknown');
      }),
    ]).then(results => {
      if (!active) return;
      if (results[0].status === 'rejected') setBridgeState('blocked');
      if (results[1].status === 'rejected') setPortalVersion('Unavailable');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    const queueRefresh = () => {
      if (!active || !isMountedRef.current) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (active && isMountedRef.current) load(true);
      }, 4000);
    };
    const channel = supabase
      .channel('business-os-live-command')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_boards' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, queueRefresh)
      .subscribe(status => {
        if (!active || !isMountedRef.current) return;
        if (status === 'SUBSCRIBED') setRealtimeState('online');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeState('blocked');
        else setRealtimeState('checking');
      });
    const interval = window.setInterval(() => {
      if (active && isMountedRef.current && Date.now() - lastRefreshRef.current > 60_000) load(true);
    }, 60_000);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const metrics = useMemo(() => buildDashboardMetrics(boards, profiles), [boards, profiles]);
  const snapshot = useMemo(() => buildBusinessOsSnapshot(metrics), [metrics]);

  const openTask = (task: TaskWithContext) => {
    const detail = { taskId: task.task.id, boardId: task.boardId, groupId: task.groupId };
    try { localStorage.setItem('openTaskModal', JSON.stringify(detail)); } catch {}
    setCurrentView(ToolView.TASKS);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('openTaskModal', { detail })));
  };

  const openRisk = (risk: ClientRisk) => {
    const firstTask = metrics.openTasks.find(task => task.boardId === risk.board.id);
    if (firstTask) openTask(firstTask);
    else setCurrentView(ToolView.TASKS);
  };

  const connections: ConnectionState[] = [
    { label: 'Portal data', detail: loading ? 'Reading current boards' : `${boards.length} client boards loaded`, state: error ? 'blocked' : loading ? 'checking' : 'online' },
    { label: 'Supabase realtime', detail: 'Live board and profile change stream', state: realtimeState },
    { label: 'Echo bridge', detail: 'Hermes command and routing service', state: bridgeState },
    { label: 'Portal release', detail: `Version ${portalVersion}`, state: portalVersion === 'Unavailable' ? 'blocked' : portalVersion === 'Checking' ? 'checking' : 'online' },
  ];

  if (loading) {
    return <div className="flex h-80 items-center justify-center gap-3 text-portal-soft"><Loader2 className="h-5 w-5 animate-spin text-brand-400" />Starting Business OS from live Portal data...</div>;
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-5 p-4 md:p-6">
      <header className="relative overflow-hidden border border-white/[0.07] bg-portal-surface">
        <div className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
        <div className="flex flex-col gap-5 px-5 py-5 md:px-7 md:py-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-brand-500/25 bg-brand-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300">Ben command layer</span>
              <span className="flex items-center gap-1.5 text-[11px] text-portal-soft"><Radio className="h-3.5 w-3.5 text-emerald-400" />Live Portal evidence</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">Business OS</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-portal-soft">One operating view for client risk, decisions, delivery gates, team load and proof. Every count below comes from the current Portal boards.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-portal-soft">Last read <span className="ml-1 font-semibold text-white">{formatTime(lastUpdated)}</span></div>
            <button type="button" onClick={() => load(true)} className="flex items-center gap-2 bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-500">
              <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh evidence
            </button>
          </div>
        </div>
      </header>

      {error ? <div className="flex items-center gap-3 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300"><AlertTriangle className="h-5 w-5" />{error}</div> : null}

      <section aria-label="Business OS headline metrics" className="grid overflow-hidden border border-white/[0.07] bg-portal-surface grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <MetricCell label="Critical clients" value={snapshot.criticalClientCount} detail="Highest current operational risk" tone="red" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCell label="Decisions" value={snapshot.decisionQueue.length} detail="Items explicitly needing Ben judgement" tone="amber" icon={<Gauge className="h-4 w-4" />} />
        <MetricCell label="Proof gaps" value={snapshot.completedProofGaps.length} detail="Completed tasks without linked evidence" tone="orange" icon={<FileWarning className="h-4 w-4" />} />
        <MetricCell label="In review" value={snapshot.reviewQueue.length} detail="Open QA and review work" tone="blue" icon={<ShieldCheck className="h-4 w-4" />} />
        <MetricCell label="Client handoff" value={snapshot.sendQueue.length} detail="Open work in send-to-client lanes" tone="green" icon={<Send className="h-4 w-4" />} />
        <MetricCell label="Open delivery" value={metrics.openTasks.length} detail={`${metrics.overdueTasks.length} overdue across active boards`} tone="orange" icon={<Layers3 className="h-4 w-4" />} />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <section className="overflow-hidden border border-white/[0.07] bg-portal-surface xl:col-span-8">
          <SectionHeader eyebrow="Your judgement" title="Decision Queue" count={snapshot.decisionQueue.length} detail="Explicit Ben approval and decision signals" />
          {snapshot.decisionQueue.length ? snapshot.decisionQueue.slice(0, 12).map(task => <TaskRow key={`${task.boardId}-${task.task.id}`} task={task} onOpen={openTask} />) : <div className="px-5 py-10 text-center text-sm text-portal-soft">No Portal tasks explicitly call for Ben approval or a decision.</div>}
        </section>

        <aside className="overflow-hidden border border-white/[0.07] bg-portal-surface xl:col-span-4">
          <SectionHeader eyebrow="Infrastructure" title="System Connections" />
          {connections.map(item => <ConnectionRow key={item.label} item={item} />)}
          <div className="border-t border-white/[0.07] bg-white/[0.018] px-5 py-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-white"><Activity className="h-4 w-4 text-brand-400" />Operating boundary</div>
            <p className="mt-2 text-[11px] leading-relaxed text-portal-soft">This page is read-only. It can open exact tasks, but it cannot send messages, publish work or mark delivery complete.</p>
          </div>
        </aside>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <section className="overflow-hidden border border-white/[0.07] bg-portal-surface xl:col-span-7">
          <SectionHeader eyebrow="Client control" title="Risk Radar" count={snapshot.atRiskClientCount} detail="Critical and high-risk boards first" />
          {metrics.clientRisks.length ? metrics.clientRisks.slice(0, 12).map(risk => <RiskLine key={risk.board.id} risk={risk} onOpen={openRisk} />) : <div className="px-5 py-10 text-center text-sm text-portal-soft">No current client risk signals.</div>}
        </section>

        <section className="overflow-hidden border border-white/[0.07] bg-portal-surface xl:col-span-5">
          <SectionHeader eyebrow="Evidence control" title="Completion Proof Gaps" count={snapshot.completedProofGaps.length} detail="Status is not proof" />
          {snapshot.completedProofGaps.length ? snapshot.completedProofGaps.slice(0, 10).map(task => <TaskRow key={`${task.boardId}-${task.task.id}`} task={task} actionLabel="Inspect" onOpen={openTask} />) : <div className="flex flex-col items-center px-5 py-10 text-center"><CheckCircle2 className="h-6 w-6 text-emerald-400" /><div className="mt-2 text-sm font-medium text-white">No completed proof gaps detected</div><div className="mt-1 text-xs text-portal-soft">Every completed task in scope has a proof-bearing link or attachment.</div></div>}
        </section>
      </div>

      <section className="overflow-hidden border border-white/[0.07] bg-portal-surface">
        <SectionHeader eyebrow="Accountability" title="Team Load" count={metrics.workloadRows.length} detail="Portal assignments, not activity theatre" />
        {metrics.workloadRows.length ? metrics.workloadRows.slice(0, 15).map(row => <WorkloadLine key={row.profile.id} row={row} />) : <div className="px-5 py-10 text-center text-sm text-portal-soft">No assigned workload found.</div>}
      </section>

      <footer className="grid gap-3 border border-white/[0.07] bg-portal-surface p-4 text-[11px] text-portal-soft md:grid-cols-3 md:p-5">
        <div className="flex gap-2"><Database className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-400" /><span><strong className="text-white">Source:</strong> live Portal client boards and profiles.</span></div>
        <div className="flex gap-2"><CircleDot className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-400" /><span><strong className="text-white">Evidence rule:</strong> worksheet, client sheet, attachment or linked proof comment.</span></div>
        <div className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-400" /><span><strong className="text-white">Refresh:</strong> realtime change stream plus one-minute safety read.</span></div>
      </footer>
    </div>
  );
};

const BusinessOS: React.FC<BusinessOSProps> = props => {
  if (!isBenBusinessOsUser(props.currentUser.id)) {
    return (
      <div className="flex h-80 items-center justify-center px-6 text-center">
        <div>
          <ShieldCheck className="mx-auto h-7 w-7 text-portal-soft" />
          <div className="mt-3 text-sm font-semibold text-white">Business OS access is restricted</div>
          <div className="mt-1 text-xs text-portal-soft">This owner-only surface has not loaded any operating data.</div>
        </div>
      </div>
    );
  }
  return <BusinessOSContent {...props} />;
};

export default BusinessOS;
