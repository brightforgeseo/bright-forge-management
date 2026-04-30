/**
 * Business Context Loader for Echo AI
 * Dynamically loads clients, tasks, and comments to give AI real business knowledge
 */

import { supabase } from '../lib/supabaseClient';
import { ClientBoard, Task, TaskComment, Profile } from '../types';
import { fetchClientBoards } from './databaseService';

export interface BusinessContext {
  clients: ClientSummary[];
  recentTasks: TaskSummary[];
  recentComments: CommentSummary[];
  teamMembers: TeamMemberSummary[];
  statistics: BusinessStats;
  // Auto-detected risks Echo can flag without being asked
  risks: RiskSummary;
  // Recent chat activity across channels
  recentChat: ChatSummary[];
}

export interface RiskSummary {
  // Tasks due in next 3 days that aren't started yet
  imminentNotStarted: TaskSummary[];
  // Tasks with no comment activity in 14+ days but still open
  staleTasks: TaskSummary[];
  // Members with > 8 active tasks OR > 2 overdue
  overloadedMembers: TeamMemberSummary[];
  // Clients with > 5 overdue tasks
  atRiskClients: ClientSummary[];
}

export interface ChatSummary {
  channelName: string;
  sender: string;
  text: string;
  timestamp: string;
}

export interface ClientSummary {
  name: string;
  initials: string;
  website?: string;
  taskCount: number;
  overdueCount: number;
  completedCount: number;
  recentActivity?: string;
}

export interface TaskSummary {
  title: string;
  clientName: string;
  status: string;
  priority: string;
  dueDate: string;
  assignedTo: string[];
  commentCount: number;
  isOverdue: boolean;
}

export interface CommentSummary {
  taskTitle: string;
  clientName: string;
  author: string;
  text: string;
  timestamp: string;
}

export interface TeamMemberSummary {
  name: string;
  taskCount: number;
  overdueCount: number;
}

export interface BusinessStats {
  totalClients: number;
  totalTasks: number;
  overdueTasks: number;
  tasksCompletedThisWeek: number;
  tasksDueThisWeek: number;
}

// Cache the context to avoid excessive DB calls
let cachedContext: BusinessContext | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load business context from the database
 * Includes clients, tasks, comments, and team members
 */
export const loadBusinessContext = async (forceRefresh = false): Promise<BusinessContext> => {
  const now = Date.now();

  // Return cached if fresh
  if (!forceRefresh && cachedContext && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedContext;
  }

  try {
    // IMPORTANT: use fetchClientBoards (which dedupes by board_data.id) — the
    // raw client_boards table contains historical duplicates. Hitting it directly
    // inflates client/task counts and makes Echo report nonsense numbers.
    const [dedupedBoards, profilesResult, chatResult] = await Promise.all([
      fetchClientBoards(),
      supabase.from('profiles').select('id, full_name'),
      // Last 30 chat messages across all channels — gives Echo conversation awareness
      supabase
        .from('chat_messages')
        .select('text, sender, created_at, channel_id, channels(name)')
        .order('created_at', { ascending: false })
        .limit(30)
    ]);

    // Wrap the deduped boards in the {board_data} shape the rest of this function expects
    const boards = dedupedBoards.map(b => ({ board_data: b }));
    const profiles = profilesResult.data || [];
    const chatRows = chatResult.data || [];

    // Build profile lookup map
    const profileMap = new Map<string, string>();
    profiles.forEach((p: any) => {
      if (p.id && p.full_name) {
        profileMap.set(p.id, p.full_name);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Status keywords/colors that mean a task is done. Used because status IDs
    // are per-client (e.g. "s1") while label/color tells the real story.
    const completedKeywords = ['done', 'complete', 'finished', 'closed', 'approved', 'shipped', 'delivered', 'resolved', 'sent to client', 'archived'];
    const completedColors = ['#00c875', '#00ca72', '#22c55e', '#16a34a', '#15803d', '#166534', '#4ade80', '#86efac', 'green'];
    const isCompletedStatusInfo = (label?: string, color?: string): boolean => {
      const l = (label || '').toLowerCase();
      if (completedKeywords.some(k => l.includes(k))) return true;
      if (color && completedColors.includes(color.toLowerCase())) return true;
      return false;
    };

    const clients: ClientSummary[] = [];
    const recentTasks: TaskSummary[] = [];
    const recentComments: CommentSummary[] = [];
    const teamTaskCounts = new Map<string, { total: number; overdue: number }>();

    let totalTasks = 0;
    let overdueTasks = 0;
    let tasksCompletedThisWeek = 0;
    let tasksDueThisWeek = 0;

    // Process each board
    for (const row of boards) {
      const board = row.board_data as ClientBoard;
      if (!board || !board.groups) continue;

      // Build a status-id -> { label, color } lookup for THIS client's custom statuses
      const statusMap = new Map<string, { label: string; color?: string }>();
      const statusDefs = (board as any).statusDefs || [];
      for (const def of statusDefs) {
        if (def?.id) statusMap.set(def.id, { label: def.label || '', color: def.color });
      }
      const priorityMap = new Map<string, { label: string; color?: string }>();
      const priorityDefs = (board as any).priorityDefs || [];
      for (const def of priorityDefs) {
        if (def?.id) priorityMap.set(def.id, { label: def.label || '', color: def.color });
      }

      let clientTaskCount = 0;
      let clientOverdueCount = 0;
      let clientCompletedCount = 0;
      let latestActivity: string | undefined;

      for (const group of board.groups) {
        if (!group.tasks) continue;

        for (const task of group.tasks) {
          totalTasks++;
          clientTaskCount++;

          // Resolve the human-readable status + completion using client's own status defs
          const statusInfo = statusMap.get(task.status as string);
          const statusLabel = statusInfo?.label || task.status || 'Unknown';
          const isDone = isCompletedStatusInfo(statusInfo?.label, statusInfo?.color)
            || (task as any).archived === true
            || (task as any).isArchived === true;

          const priorityInfo = priorityMap.get(task.priority as string);
          const priorityLabel = priorityInfo?.label || task.priority || '';

          const dueDate = task.dueDate ? new Date(task.dueDate) : null;
          const isOverdue = dueDate ? dueDate < today && !isDone : false;

          if (isOverdue) {
            overdueTasks++;
            clientOverdueCount++;
          }

          if (isDone) {
            clientCompletedCount++;
            tasksCompletedThisWeek++; // Simplified - would need timestamp
          }

          if (dueDate && dueDate >= today && dueDate <= weekFromNow) {
            tasksDueThisWeek++;
          }

          // Track team member task counts
          const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [];
          for (const memberId of assignedIds) {
            const existing = teamTaskCounts.get(memberId) || { total: 0, overdue: 0 };
            existing.total++;
            if (isOverdue) existing.overdue++;
            teamTaskCounts.set(memberId, existing);
          }

          // Add to recent tasks (limit to non-completed, prioritize by due date)
          if (!isDone && recentTasks.length < 30) {
            recentTasks.push({
              title: task.title,
              clientName: board.name,
              status: statusLabel,        // human-readable label, not the ID
              priority: priorityLabel,    // human-readable label, not the ID
              dueDate: task.dueDate || 'No date',
              assignedTo: assignedIds.map(id => profileMap.get(id) || 'Unknown'),
              commentCount: task.comments?.length || 0,
              isOverdue
            });
          }

          // Extract recent comments
          if (task.comments && task.comments.length > 0) {
            for (const comment of task.comments.slice(-3)) { // Last 3 comments per task
              recentComments.push({
                taskTitle: task.title,
                clientName: board.name,
                author: comment.author,
                text: comment.text.substring(0, 200), // Truncate for token efficiency
                timestamp: comment.timestamp
              });

              // Track latest activity
              if (!latestActivity || comment.timestamp > latestActivity) {
                latestActivity = comment.timestamp;
              }
            }
          }
        }
      }

      clients.push({
        name: board.name,
        initials: board.initials,
        website: board.website,
        taskCount: clientTaskCount,
        overdueCount: clientOverdueCount,
        completedCount: clientCompletedCount,
        recentActivity: latestActivity
      });
    }

    // Sort recent tasks by due date (overdue first, then upcoming)
    recentTasks.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    // Sort comments by timestamp (most recent first) and limit
    recentComments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedComments = recentComments.slice(0, 30);

    // Build team member summaries
    const teamMembers: TeamMemberSummary[] = [];
    teamTaskCounts.forEach((counts, memberId) => {
      const name = profileMap.get(memberId);
      if (name) {
        teamMembers.push({
          name,
          taskCount: counts.total,
          overdueCount: counts.overdue
        });
      }
    });

    teamMembers.sort((a, b) => b.taskCount - a.taskCount);

    // ---- Auto-detected risks ---------------------------------------------------
    // Imminent: due within 3 days but not yet "in progress" or "done"
    const threeDaysOut = new Date(today);
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    const imminentNotStarted = recentTasks.filter(t => {
      if (t.dueDate === 'No date') return false;
      const due = new Date(t.dueDate);
      const status = (t.status || '').toLowerCase();
      const notStarted = status.includes('not started') || status.includes('todo') || status === '';
      return due >= today && due <= threeDaysOut && notStarted;
    }).slice(0, 10);

    // Stale: no comment in 14+ days but task still open
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenIso = fourteenDaysAgo.toISOString();
    const taskLastCommentMap = new Map<string, string>();
    for (const c of recentComments) {
      const key = `${c.clientName}|${c.taskTitle}`;
      const existing = taskLastCommentMap.get(key);
      if (!existing || c.timestamp > existing) taskLastCommentMap.set(key, c.timestamp);
    }
    const staleTasks = recentTasks.filter(t => {
      const last = taskLastCommentMap.get(`${t.clientName}|${t.title}`);
      // No activity recorded OR last comment older than cutoff
      return !last || last < fourteenIso;
    }).slice(0, 10);

    // Overloaded: > 8 active tasks OR > 2 overdue
    const overloadedMembers = teamMembers.filter(m => m.taskCount > 8 || m.overdueCount > 2);

    // At-risk clients: > 5 overdue tasks
    const atRiskClients = clients.filter(c => c.overdueCount > 5);

    // ---- Recent chat across channels ------------------------------------------
    const recentChat: ChatSummary[] = chatRows.map((m: any) => ({
      channelName: m.channels?.name || 'unknown',
      sender: m.sender || 'unknown',
      text: (m.text || '').substring(0, 160),
      timestamp: m.created_at
    })).slice(0, 25);

    const context: BusinessContext = {
      clients,
      recentTasks: recentTasks.slice(0, 20), // Limit for token efficiency
      recentComments: limitedComments,
      teamMembers: teamMembers.slice(0, 15),
      statistics: {
        totalClients: clients.length,
        totalTasks,
        overdueTasks,
        tasksCompletedThisWeek,
        tasksDueThisWeek
      },
      risks: {
        imminentNotStarted,
        staleTasks,
        overloadedMembers,
        atRiskClients
      },
      recentChat
    };

    // Cache the result
    cachedContext = context;
    cacheTimestamp = now;

    return context;
  } catch (error) {
    console.error('[BusinessContext] Failed to load:', error);
    // Return empty context on error
    return {
      clients: [],
      recentTasks: [],
      recentComments: [],
      teamMembers: [],
      statistics: {
        totalClients: 0,
        totalTasks: 0,
        overdueTasks: 0,
        tasksCompletedThisWeek: 0,
        tasksDueThisWeek: 0
      },
      risks: { imminentNotStarted: [], staleTasks: [], overloadedMembers: [], atRiskClients: [] },
      recentChat: []
    };
  }
};

/**
 * Format business context as a concise prompt section
 * Optimized for token efficiency while maintaining quality
 */
export const formatBusinessContextForPrompt = (context: BusinessContext): string => {
  const { clients, recentTasks, recentComments, teamMembers, statistics, risks, recentChat } = context;

  const clientList = clients.length > 0
    ? clients.map(c => `- ${c.name}${c.website ? ` (${c.website})` : ''}: ${c.taskCount} tasks, ${c.overdueCount} overdue, ${c.completedCount} done`).join('\n')
    : 'No clients loaded';

  const priorityTasks = recentTasks.slice(0, 12);
  const taskList = priorityTasks.length > 0
    ? priorityTasks.map(t => {
        const flag = t.isOverdue ? '[OVERDUE] ' : '';
        const who = t.assignedTo.length ? ` | Assigned: ${t.assignedTo.join(', ')}` : ' | Unassigned';
        return `- ${flag}"${t.title}" (${t.clientName}) | ${t.status} | ${t.priority || 'no priority'} | Due: ${t.dueDate}${who}`;
      }).join('\n')
    : 'No pending tasks';

  const activityList = recentComments.slice(0, 10)
    .map(c => `- ${c.author} on "${c.taskTitle}" (${c.clientName}): "${c.text.substring(0, 120)}"`)
    .join('\n');

  const teamList = teamMembers.slice(0, 10)
    .map(m => `- ${m.name}: ${m.taskCount} tasks${m.overdueCount > 0 ? ` (${m.overdueCount} overdue)` : ''}`)
    .join('\n');

  // Auto-detected risks block — Echo can flag these without being asked
  const fmtRiskTask = (t: TaskSummary) =>
    `  - "${t.title}" (${t.clientName}) | ${t.status} | Due: ${t.dueDate}${t.assignedTo.length ? ` | ${t.assignedTo.join(', ')}` : ' | unassigned'}`;
  const risksBlock = `
### Auto-Detected Risks
**Imminent (due ≤3 days, not started):** ${risks.imminentNotStarted.length || 0}
${risks.imminentNotStarted.map(fmtRiskTask).join('\n') || '  (none)'}

**Stale (no comment in 14+ days, still open):** ${risks.staleTasks.length || 0}
${risks.staleTasks.slice(0, 6).map(fmtRiskTask).join('\n') || '  (none)'}

**Overloaded team members (>8 tasks or >2 overdue):** ${risks.overloadedMembers.length || 0}
${risks.overloadedMembers.map(m => `  - ${m.name}: ${m.taskCount} tasks (${m.overdueCount} overdue)`).join('\n') || '  (none)'}

**At-risk clients (>5 overdue):** ${risks.atRiskClients.length || 0}
${risks.atRiskClients.map(c => `  - ${c.name}: ${c.overdueCount} overdue`).join('\n') || '  (none)'}`;

  // Recent chat across channels — Echo is conversation-aware
  const chatList = recentChat.length > 0
    ? recentChat.slice(0, 12).map(m => `- #${m.channelName} | ${m.sender}: "${m.text}"`).join('\n')
    : '(no recent chat)';

  return `
## LIVE BUSINESS DATA (Updated: ${new Date().toLocaleString()})

### Dashboard Statistics
- Total Clients: ${statistics.totalClients}
- Total Tasks: ${statistics.totalTasks}
- Overdue Tasks: ${statistics.overdueTasks}
- Due This Week: ${statistics.tasksDueThisWeek}

### Active Clients
${clientList}

### Priority Tasks (open, sorted overdue → upcoming)
${taskList}
${risksBlock}

### Recent Task Comments
${activityList || 'No recent comments'}

### Recent Team Chat (last 12 messages)
${chatList}

### Team Workload
${teamList || 'No team data'}
`;
};

/**
 * Get context for a specific client
 */
export const getClientContext = async (clientName: string): Promise<string> => {
  const context = await loadBusinessContext();

  const client = context.clients.find(c =>
    c.name.toLowerCase().includes(clientName.toLowerCase())
  );

  if (!client) {
    return `No client found matching "${clientName}"`;
  }

  const clientTasks = context.recentTasks.filter(t =>
    t.clientName.toLowerCase() === client.name.toLowerCase()
  );

  const clientComments = context.recentComments.filter(c =>
    c.clientName.toLowerCase() === client.name.toLowerCase()
  );

  return `
## Client: ${client.name}
- Website: ${client.website || 'Not set'}
- Total Tasks: ${client.taskCount}
- Overdue: ${client.overdueCount}
- Completed: ${client.completedCount}

### Current Tasks
${clientTasks.map(t => `- ${t.isOverdue ? '[OVERDUE] ' : ''}"${t.title}" | ${t.status} | ${t.priority} | Due: ${t.dueDate}`).join('\n') || 'No active tasks'}

### Recent Updates
${clientComments.map(c => `- ${c.author}: "${c.text.substring(0, 150)}"`).join('\n') || 'No recent updates'}
`;
};

/**
 * Clear the cache (call when data changes)
 */
export const clearBusinessContextCache = () => {
  cachedContext = null;
  cacheTimestamp = 0;
};
