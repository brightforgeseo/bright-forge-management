/**
 * Business Context Loader for Echo AI
 * Dynamically loads clients, tasks, and comments to give AI real business knowledge
 */

import { supabase } from '../lib/supabaseClient';
import { ClientBoard, Task, TaskComment, Profile } from '../types';

export interface BusinessContext {
  clients: ClientSummary[];
  recentTasks: TaskSummary[];
  recentComments: CommentSummary[];
  teamMembers: TeamMemberSummary[];
  statistics: BusinessStats;
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
    // Fetch all data in parallel for efficiency
    const [boardsResult, profilesResult] = await Promise.all([
      supabase.from('client_boards').select('*'),
      supabase.from('profiles').select('id, full_name')
    ]);

    const boards = boardsResult.data || [];
    const profiles = profilesResult.data || [];

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

      let clientTaskCount = 0;
      let clientOverdueCount = 0;
      let clientCompletedCount = 0;
      let latestActivity: string | undefined;

      for (const group of board.groups) {
        if (!group.tasks) continue;

        for (const task of group.tasks) {
          totalTasks++;
          clientTaskCount++;

          const dueDate = task.dueDate ? new Date(task.dueDate) : null;
          const isOverdue = dueDate ? dueDate < today && task.status !== 'Done' && task.status !== 'Completed' : false;
          const isDone = task.status === 'Done' || task.status === 'Completed';

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
          if (!isDone && recentTasks.length < 25) {
            recentTasks.push({
              title: task.title,
              clientName: board.name,
              status: task.status,
              priority: task.priority,
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
      }
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
      }
    };
  }
};

/**
 * Format business context as a concise prompt section
 * Optimized for token efficiency while maintaining quality
 */
export const formatBusinessContextForPrompt = (context: BusinessContext): string => {
  const { clients, recentTasks, recentComments, teamMembers, statistics } = context;

  // Build concise client list
  const clientList = clients.length > 0
    ? clients.map(c => `- ${c.name}${c.website ? ` (${c.website})` : ''}: ${c.taskCount} tasks, ${c.overdueCount} overdue`).join('\n')
    : 'No clients loaded';

  // Build priority tasks (overdue + upcoming)
  const priorityTasks = recentTasks.slice(0, 10);
  const taskList = priorityTasks.length > 0
    ? priorityTasks.map(t => {
        const flag = t.isOverdue ? '[OVERDUE]' : '';
        return `- ${flag} "${t.title}" for ${t.clientName} | ${t.status} | Due: ${t.dueDate}`;
      }).join('\n')
    : 'No pending tasks';

  // Build recent activity from comments
  const activityList = recentComments.slice(0, 8)
    .map(c => `- ${c.author} on "${c.taskTitle}" (${c.clientName}): "${c.text.substring(0, 100)}..."`)
    .join('\n');

  // Build team workload
  const teamList = teamMembers.slice(0, 8)
    .map(m => `- ${m.name}: ${m.taskCount} tasks${m.overdueCount > 0 ? ` (${m.overdueCount} overdue)` : ''}`)
    .join('\n');

  return `
## LIVE BUSINESS DATA (Updated: ${new Date().toLocaleString()})

### Dashboard Statistics
- Total Clients: ${statistics.totalClients}
- Total Tasks: ${statistics.totalTasks}
- Overdue Tasks: ${statistics.overdueTasks}
- Due This Week: ${statistics.tasksDueThisWeek}

### Active Clients
${clientList}

### Priority Tasks
${taskList}

### Recent Activity
${activityList || 'No recent comments'}

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
