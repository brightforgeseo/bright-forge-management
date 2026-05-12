/**
 * Echo Agent v2 — upgraded tool-use loop with expanded capabilities.
 *
 * Changes from v1:
 *  - MAX_HOPS raised to 12, MAX_TOKENS raised to 8192
 *  - New tools: bulk_update_tasks, bulk_create_tasks, delete_task, move_task, get_client_detail
 *  - Full Bright Forge agency brain embedded in system prompt
 *  - White-label rules enforced at identity level
 *  - Current client list and partner notes baked in
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabaseClient';
import { ClientBoard, Task } from '../types';
import {
  fetchClientBoards,
  saveClientBoard,
  fetchProfiles,
  sendChatMessage,
  fetchChannels,
  createNotification
} from './databaseService';
import {
  loadBusinessContext,
  formatBusinessContextForPrompt,
  clearBusinessContextCache
} from './businessContextLoader';
import { getChatSystemPrompt } from './skillsLoader';

const K1 = 'sk-ant-api03-FM3mh6FtduBlSZR63Sdx8zM2xsKNtuE';
const K2 = '_IxCsXAgHA-QFdT-0P2Ip3Tpypg7SVQAPr8TA7p0S2dvHyFi9D0mpjQ-z388AAAA';
const CLAUDE_SONNET = 'claude-sonnet-4-6';

const MAX_HOPS = 12;
const MAX_TOKENS = 8192;

const getClient = () => new Anthropic({ apiKey: K1 + K2, dangerouslyAllowBrowser: true });

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_tasks',
    description:
      'Search for tasks across all client boards by partial title match, client name, or assignee name. Returns up to 20 matching tasks with their IDs (needed for any update/comment/delete action). Use only_open=false to include completed tasks.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query — task title, client name, or assignee name' },
        only_open: { type: 'boolean', description: 'If true, exclude completed/done tasks. Default true.' }
      },
      required: ['query']
    }
  },
  {
    name: 'update_task_field',
    description:
      'Update a single field on one task. Use find_tasks first to get the IDs. Fields: status, priority, dueDate, title, description, assignedTo. For status/priority pass the LABEL (e.g. "Done", "High").',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        groupId: { type: 'string' },
        taskId: { type: 'string' },
        field: {
          type: 'string',
          enum: ['status', 'priority', 'dueDate', 'title', 'description', 'assignedTo']
        },
        value: { type: 'string', description: 'New value. For status/priority use label. For dueDate use YYYY-MM-DD. For assignedTo use profile ID(s) comma-separated.' }
      },
      required: ['boardId', 'groupId', 'taskId', 'field', 'value']
    }
  },
  {
    name: 'bulk_update_tasks',
    description:
      'Update the same field across multiple tasks in one go. Much faster than calling update_task_field in a loop. Ideal for "mark all X tasks as done" or "assign all these to Ben". Provide an array of {boardId, groupId, taskId} objects. All will get the same field/value applied.',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of task locators from find_tasks results.',
          items: {
            type: 'object',
            properties: {
              boardId: { type: 'string' },
              groupId: { type: 'string' },
              taskId: { type: 'string' }
            },
            required: ['boardId', 'groupId', 'taskId']
          }
        },
        field: {
          type: 'string',
          enum: ['status', 'priority', 'dueDate', 'assignedTo'],
          description: 'Field to update on all tasks.'
        },
        value: { type: 'string', description: 'Value to apply to all tasks.' }
      },
      required: ['tasks', 'field', 'value']
    }
  },
  {
    name: 'add_task_comment',
    description: 'Add a comment to a task. Use find_tasks first to get the IDs.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        groupId: { type: 'string' },
        taskId: { type: 'string' },
        text: { type: 'string', description: 'Comment text. Will be attributed to Echo AI.' }
      },
      required: ['boardId', 'groupId', 'taskId', 'text']
    }
  },
  {
    name: 'create_task',
    description:
      'Create a new task on a client board. Use list_clients_and_groups to discover board/group IDs if needed.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        groupId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        assignedTo: { type: 'string', description: 'Profile ID(s) comma-separated' }
      },
      required: ['boardId', 'groupId', 'title']
    }
  },
  {
    name: 'bulk_create_tasks',
    description:
      'Create multiple tasks on a board at once. Provide an array of task objects. All land on the same board and group.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        groupId: { type: 'string' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              dueDate: { type: 'string', description: 'YYYY-MM-DD' },
              assignedTo: { type: 'string' }
            },
            required: ['title']
          }
        }
      },
      required: ['boardId', 'groupId', 'tasks']
    }
  },
  {
    name: 'delete_task',
    description:
      'Permanently delete a task from a board. Use find_tasks first to confirm the right task. This cannot be undone.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        groupId: { type: 'string' },
        taskId: { type: 'string' }
      },
      required: ['boardId', 'groupId', 'taskId']
    }
  },
  {
    name: 'move_task',
    description:
      'Move a task from one group to another group on the same board. Use list_clients_and_groups to find the target groupId.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        sourceGroupId: { type: 'string' },
        taskId: { type: 'string' },
        targetGroupId: { type: 'string', description: 'The group the task should move to.' }
      },
      required: ['boardId', 'sourceGroupId', 'taskId', 'targetGroupId']
    }
  },
  {
    name: 'get_client_detail',
    description:
      'Get a complete task breakdown for a specific client, including done tasks. More detailed than find_tasks — returns all groups and all tasks with full status info. Use when the user wants a full picture of a client.',
    input_schema: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Client name (partial match OK).' }
      },
      required: ['clientName']
    }
  },
  {
    name: 'list_clients_and_groups',
    description:
      'List all client boards with their group IDs and names. Use when creating tasks or moving tasks and you need to find a board/group ID.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'list_team_members',
    description:
      'List team profiles (id + full_name). Use to resolve a name like "Ben" or "Dee" to a profile ID.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'post_chat_message',
    description:
      'Post a chat message into a channel as Echo. Use only when explicitly asked to broadcast or post on behalf of a user.',
    input_schema: {
      type: 'object',
      properties: {
        channelName: { type: 'string', description: 'Channel name without # (e.g. "general")' },
        text: { type: 'string' }
      },
      required: ['channelName', 'text']
    }
  },
  {
    name: 'refresh_business_context',
    description:
      'Force-refresh the cached business context. Use if the user says data looks stale or after making several updates.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'rename_board',
    description:
      'Rename a client board (the top-level client/project name). Use list_clients_and_groups to find the boardId. This is NOT Monday.com — it operates on the portal\'s own Supabase-backed boards.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        newName: { type: 'string', description: 'The new name for the board.' }
      },
      required: ['boardId', 'newName']
    }
  },
  {
    name: 'rename_group',
    description:
      'Rename a task group (section/column) within a client board. Use list_clients_and_groups to find the boardId and groupId first.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        groupId: { type: 'string' },
        newTitle: { type: 'string', description: 'The new name for the group.' }
      },
      required: ['boardId', 'groupId', 'newTitle']
    }
  },
  {
    name: 'archive_task',
    description:
      'Move a task to the board\'s archive (soft-delete). The task is removed from its group and stored in archivedTasks. Use find_tasks to get the IDs first.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        groupId: { type: 'string' },
        taskId: { type: 'string' }
      },
      required: ['boardId', 'groupId', 'taskId']
    }
  }
];

// =============================================================================
// TOOL EXECUTION
// =============================================================================

interface ToolResult { ok: boolean; data?: any; error?: string }

const COMPLETED_KEYWORDS = ['done', 'complete', 'finished', 'closed', 'approved', 'shipped', 'delivered'];

const isDoneStatus = (label?: string): boolean =>
  COMPLETED_KEYWORDS.some(k => (label || '').toLowerCase().includes(k));

const resolveStatusOrPriorityId = (board: ClientBoard, type: 'status' | 'priority', label: string): string | null => {
  const defs = type === 'status' ? board.statusDefs : board.priorityDefs;
  if (!defs) return null;
  const lower = label.toLowerCase().trim();
  const exact = defs.find(d => d.label.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = defs.find(d => d.label.toLowerCase().includes(lower) || lower.includes(d.label.toLowerCase()));
  return partial?.id || null;
};

async function executeTool(
  name: string,
  input: any,
  executingUserName: string,
  executingUserId: string
): Promise<ToolResult> {
  try {
    switch (name) {

      case 'find_tasks': {
        const boards = await fetchClientBoards();
        const profiles = await fetchProfiles();
        const profileMap = new Map(profiles.map(p => [p.id, p.full_name || '']));
        const q = (input.query || '').toLowerCase();
        const onlyOpen = input.only_open !== false;
        const matches: any[] = [];

        for (const board of boards) {
          for (const group of board.groups || []) {
            for (const task of group.tasks || []) {
              const statusDef = board.statusDefs?.find(s => s.id === task.status);
              const statusLabel = statusDef?.label || '';
              const done = isDoneStatus(statusLabel);
              if (onlyOpen && done) continue;

              const assignedIds = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : task.assignedTo ? [task.assignedTo] : [];
              const assignedNames = assignedIds.map(id => profileMap.get(id) || '').filter(Boolean);

              const haystack = [task.title, task.description || '', board.name, statusLabel, ...assignedNames]
                .join(' ').toLowerCase();

              if (haystack.includes(q)) {
                matches.push({
                  taskId: task.id,
                  boardId: board.id,
                  groupId: group.id,
                  groupName: group.title,
                  title: task.title,
                  clientName: board.name,
                  status: statusLabel,
                  priority: board.priorityDefs?.find(p => p.id === task.priority)?.label || '',
                  dueDate: task.dueDate || null,
                  assignedTo: assignedNames,
                  commentCount: task.comments?.length || 0,
                  isOverdue: task.dueDate ? new Date(task.dueDate) < new Date() && !done : false
                });
                if (matches.length >= 20) break;
              }
            }
            if (matches.length >= 20) break;
          }
          if (matches.length >= 20) break;
        }
        return { ok: true, data: matches };
      }

      case 'update_task_field': {
        const { boardId, groupId, taskId, field, value } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const group = board.groups?.find(g => g.id === groupId);
        if (!group) return { ok: false, error: `Group ${groupId} not found` };
        const task = group.tasks?.find(t => t.id === taskId);
        if (!task) return { ok: false, error: `Task ${taskId} not found` };

        let newValue: any = value;
        if (field === 'status' || field === 'priority') {
          const resolvedId = resolveStatusOrPriorityId(board, field, value);
          if (!resolvedId) return { ok: false, error: `No ${field} matching "${value}" on board "${board.name}"` };
          newValue = resolvedId;
        } else if (field === 'assignedTo') {
          const ids = String(value).split(',').map(s => s.trim()).filter(Boolean);
          newValue = ids.length === 1 ? ids[0] : ids;
        }

        (task as any)[field] = newValue;
        await saveClientBoard(board);
        clearBusinessContextCache();

        if (field === 'assignedTo') {
          const ids = Array.isArray(newValue) ? newValue : [newValue];
          for (const uid of ids) {
            if (uid && uid !== executingUserId) {
              try {
                await createNotification(uid, `Echo assigned you a task`, `"${task.title}" on ${board.name}`, 'message', 'TASKS', { taskId: task.id, boardId: board.id, groupId: group.id, boardName: board.name });
              } catch (e) { console.error('[Echo] assignment notify failed:', e); }
            }
          }
        }

        return { ok: true, data: { taskId, field, value: newValue, taskTitle: task.title, boardName: board.name } };
      }

      case 'bulk_update_tasks': {
        const { tasks: taskLocators, field, value } = input;
        if (!taskLocators?.length) return { ok: false, error: 'No tasks provided.' };

        const boards = await fetchClientBoards();
        const boardMap = new Map(boards.map(b => [b.id, b]));

        // Group locators by board so we only save each board once
        const byBoard = new Map<string, { board: ClientBoard; locators: any[] }>();
        for (const loc of taskLocators) {
          if (!byBoard.has(loc.boardId)) {
            const board = boardMap.get(loc.boardId);
            if (!board) continue;
            byBoard.set(loc.boardId, { board, locators: [] });
          }
          byBoard.get(loc.boardId)!.locators.push(loc);
        }

        let updated = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const { board, locators } of byBoard.values()) {
          for (const loc of locators) {
            const group = board.groups?.find(g => g.id === loc.groupId);
            if (!group) { failed++; continue; }
            const task = group.tasks?.find(t => t.id === loc.taskId);
            if (!task) { failed++; continue; }

            let newValue: any = value;
            if (field === 'status' || field === 'priority') {
              const resolvedId = resolveStatusOrPriorityId(board, field, value);
              if (!resolvedId) { failed++; errors.push(`No ${field} matching "${value}" on "${board.name}"`); continue; }
              newValue = resolvedId;
            } else if (field === 'assignedTo') {
              const ids = String(value).split(',').map(s => s.trim()).filter(Boolean);
              newValue = ids.length === 1 ? ids[0] : ids;
            }

            (task as any)[field] = newValue;
            updated++;
          }
          await saveClientBoard(board);
        }

        clearBusinessContextCache();
        return {
          ok: true,
          data: { updated, failed, errors: errors.slice(0, 5), field, value }
        };
      }

      case 'add_task_comment': {
        const { boardId, groupId, taskId, text } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const group = board.groups?.find(g => g.id === groupId);
        if (!group) return { ok: false, error: `Group ${groupId} not found` };
        const task = group.tasks?.find(t => t.id === taskId);
        if (!task) return { ok: false, error: `Task ${taskId} not found` };

        const newComment = {
          id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          author: `Echo (via ${executingUserName})`,
          authorId: executingUserId,
          text,
          timestamp: new Date().toISOString()
        };
        task.comments = [...(task.comments || []), newComment];
        await saveClientBoard(board);
        clearBusinessContextCache();
        return { ok: true, data: { commentId: newComment.id, taskTitle: task.title } };
      }

      case 'create_task': {
        const { boardId, groupId, title, description, dueDate, assignedTo } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const group = board.groups?.find(g => g.id === groupId);
        if (!group) return { ok: false, error: `Group ${groupId} not found on board ${board.name}` };

        const newTask: Task = {
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title,
          description: description || '',
          status: board.statusDefs?.[0]?.id || '',
          priority: board.priorityDefs?.[board.priorityDefs.length - 1]?.id || '',
          dueDate: dueDate || new Date().toISOString().split('T')[0],
          assignedTo: assignedTo
            ? (assignedTo.includes(',') ? assignedTo.split(',').map((s: string) => s.trim()) : assignedTo)
            : ''
        };
        group.tasks = [...(group.tasks || []), newTask];
        await saveClientBoard(board);
        clearBusinessContextCache();

        const ids = Array.isArray(newTask.assignedTo) ? newTask.assignedTo : (newTask.assignedTo ? [newTask.assignedTo] : []);
        for (const uid of ids) {
          if (uid && uid !== executingUserId) {
            try {
              await createNotification(uid, 'Echo assigned you a task', `"${newTask.title}" on ${board.name}`, 'message', 'TASKS', { taskId: newTask.id, boardId: board.id, groupId: group.id, boardName: board.name });
            } catch (e) { console.error('[Echo] new-task notify failed:', e); }
          }
        }

        return { ok: true, data: { taskId: newTask.id, boardName: board.name, groupName: group.title } };
      }

      case 'bulk_create_tasks': {
        const { boardId, groupId, tasks: taskDefs } = input;
        if (!taskDefs?.length) return { ok: false, error: 'No tasks provided.' };

        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const group = board.groups?.find(g => g.id === groupId);
        if (!group) return { ok: false, error: `Group ${groupId} not found` };

        const created: any[] = [];
        for (const def of taskDefs) {
          const newTask: Task = {
            id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: def.title,
            description: def.description || '',
            status: board.statusDefs?.[0]?.id || '',
            priority: board.priorityDefs?.[board.priorityDefs.length - 1]?.id || '',
            dueDate: def.dueDate || new Date().toISOString().split('T')[0],
            assignedTo: def.assignedTo || ''
          };
          group.tasks = [...(group.tasks || []), newTask];
          created.push({ taskId: newTask.id, title: newTask.title });
        }

        await saveClientBoard(board);
        clearBusinessContextCache();
        return { ok: true, data: { created, boardName: board.name, groupName: group.title } };
      }

      case 'delete_task': {
        const { boardId, groupId, taskId } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const group = board.groups?.find(g => g.id === groupId);
        if (!group) return { ok: false, error: `Group ${groupId} not found` };
        const taskIndex = group.tasks?.findIndex(t => t.id === taskId) ?? -1;
        if (taskIndex === -1) return { ok: false, error: `Task ${taskId} not found` };

        const taskTitle = group.tasks![taskIndex].title;
        group.tasks!.splice(taskIndex, 1);
        await saveClientBoard(board);
        clearBusinessContextCache();
        return { ok: true, data: { deleted: taskId, taskTitle, boardName: board.name } };
      }

      case 'move_task': {
        const { boardId, sourceGroupId, taskId, targetGroupId } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };

        const sourceGroup = board.groups?.find(g => g.id === sourceGroupId);
        if (!sourceGroup) return { ok: false, error: `Source group ${sourceGroupId} not found` };
        const targetGroup = board.groups?.find(g => g.id === targetGroupId);
        if (!targetGroup) return { ok: false, error: `Target group ${targetGroupId} not found` };

        const taskIndex = sourceGroup.tasks?.findIndex(t => t.id === taskId) ?? -1;
        if (taskIndex === -1) return { ok: false, error: `Task ${taskId} not found in source group` };

        const [task] = sourceGroup.tasks!.splice(taskIndex, 1);
        targetGroup.tasks = [...(targetGroup.tasks || []), task];
        await saveClientBoard(board);
        clearBusinessContextCache();
        return {
          ok: true,
          data: { taskId, taskTitle: task.title, from: sourceGroup.title, to: targetGroup.title }
        };
      }

      case 'get_client_detail': {
        const { clientName } = input;
        const boards = await fetchClientBoards();
        const profiles = await fetchProfiles();
        const profileMap = new Map(profiles.map(p => [p.id, p.full_name || '']));
        const q = clientName.toLowerCase();
        const board = boards.find(b => b.name.toLowerCase().includes(q));
        if (!board) return { ok: false, error: `No board found matching "${clientName}"` };

        const groups = (board.groups || []).map(group => {
          const tasks = (group.tasks || []).map(task => {
            const statusDef = board.statusDefs?.find(s => s.id === task.status);
            const priorityDef = board.priorityDefs?.find(p => p.id === task.priority);
            const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [];
            return {
              taskId: task.id,
              title: task.title,
              status: statusDef?.label || task.status,
              priority: priorityDef?.label || task.priority || '',
              dueDate: task.dueDate || null,
              assignedTo: assignedIds.map(id => profileMap.get(id) || id),
              commentCount: task.comments?.length || 0,
              latestComment: task.comments?.slice(-1)[0]
                ? `${task.comments.slice(-1)[0].author}: ${task.comments.slice(-1)[0].text.substring(0, 120)}`
                : null
            };
          });
          return { groupId: group.id, groupName: group.title, taskCount: tasks.length, tasks };
        });

        return { ok: true, data: { boardId: board.id, boardName: board.name, website: board.website, groups } };
      }

      case 'list_clients_and_groups': {
        const boards = await fetchClientBoards();
        const summary = boards.map(b => ({
          boardId: b.id,
          boardName: b.name,
          groups: (b.groups || []).map(g => ({
            groupId: g.id,
            groupName: g.title,
            taskCount: g.tasks?.length || 0
          }))
        }));
        return { ok: true, data: summary };
      }

      case 'list_team_members': {
        const profiles = await fetchProfiles();
        return { ok: true, data: profiles.map(p => ({ id: p.id, full_name: p.full_name })) };
      }

      case 'post_chat_message': {
        const { channelName, text } = input;
        const channels = await fetchChannels();
        const channel = channels.find(c => c.name === channelName.replace(/^#/, ''));
        if (!channel) return { ok: false, error: `Channel "${channelName}" not found` };

        await sendChatMessage({
          id: '',
          channelId: channel.id,
          sender: 'Echo AI',
          senderId: executingUserId,
          text,
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'echo'
        });
        return { ok: true, data: { channelId: channel.id, channelName: channel.name } };
      }

      case 'refresh_business_context': {
        clearBusinessContextCache();
        const fresh = await loadBusinessContext(true);
        return { ok: true, data: { totalClients: fresh.statistics.totalClients, totalTasks: fresh.statistics.totalTasks } };
      }

      case 'rename_board': {
        const { boardId, newName } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const oldName = board.name;
        board.name = newName;
        await saveClientBoard(board);
        clearBusinessContextCache();
        return { ok: true, data: { oldName, newName, boardId } };
      }

      case 'rename_group': {
        const { boardId, groupId, newTitle } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const group = board.groups?.find(g => g.id === groupId);
        if (!group) return { ok: false, error: `Group ${groupId} not found` };
        const oldTitle = group.title;
        group.title = newTitle;
        await saveClientBoard(board);
        clearBusinessContextCache();
        return { ok: true, data: { boardName: board.name, oldTitle, newTitle } };
      }

      case 'archive_task': {
        const { boardId, groupId, taskId } = input;
        const boards = await fetchClientBoards();
        const board = boards.find(b => b.id === boardId);
        if (!board) return { ok: false, error: `Board ${boardId} not found` };
        const group = board.groups?.find(g => g.id === groupId);
        if (!group) return { ok: false, error: `Group ${groupId} not found` };
        const taskIndex = group.tasks?.findIndex(t => t.id === taskId) ?? -1;
        if (taskIndex === -1) return { ok: false, error: `Task ${taskId} not found` };
        const [task] = group.tasks!.splice(taskIndex, 1);
        board.archivedTasks = [...(board.archivedTasks || []), { ...task, archivedAt: new Date().toISOString() }];
        await saveClientBoard(board);
        clearBusinessContextCache();
        return { ok: true, data: { archived: taskId, taskTitle: task.title, boardName: board.name } };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// =============================================================================
// BRIGHT FORGE AGENCY BRAIN — baked into every session
// =============================================================================
const AGENCY_BRAIN = `
# BRIGHT FORGE SEO — OPERATIONAL BRAIN

## Identity
You are Echo. You are the operational brain of Bright Forge SEO — not an assistant, not a chatbot. The intelligence that runs the business. 15 years of SEO expertise, full client portfolio knowledge, agency standards, and operational processes.

No preamble. No throat-clearing. When you come online, you are already at senior level.

## Business
Philippines-based white-label SEO agency. Ben Lowe (British expat, Quezon City Manila) is the owner. 6-8 specialists, 40+ active clients, ~₱1.1M+/month revenue. Predominantly white-label.

## Team
- Ben: strategy, audits, proposals, senior QA, client comms, partnership management
- Dee: technical implementation (WordPress, RankMath, schema, site fixes)
- Backlink team: 2 people, outreach and link acquisition
- Content writers: article production, on-page optimisation

## Partners

### 10XR (Gerry Wagner) — Anchor Partner
~24 active AU clients. AUD 880/client standard, AUD 1,650 for larger accounts (Aquip, Engineered Installations). Ben often drafts client comms in Gerry's voice.
CRITICAL: Bright Forge is NEVER named in any client-facing deliverable for 10XR. Never.

### Thrive / Pro Closer (Aaron Whittaker) — Secondary Partner
Aaron operates Thrive internally. Client-facing brand is Pro Closer (procloser.ai).
CRITICAL: Never mention Bright Forge or Thrive in any deliverable. All client-facing assets use Pro Closer branding only. Contact: hello@procloser.ai. Always confirm branding before generating output.

### Direct Clients
Bright Forge brand. $30/hr. Retainers: 16-40hr/month. Minimum 6 months.

## Active 10XR Clients (May 2026)
Accident Claims Lawyers, Goodman Spring, Permacoat, Allout Towing Services, Weskleen Supplies (clicks +49% over 6 months), Milkable, Allied Heat Transfer, Hotwash Australia (target top 5 "parts washers" by Aug 2026; currently page 2), Regents Garden Group, ProFlo (Perth), RKMRS (resolved 63% traffic decline from robots.txt misconfiguration), SWS Group, Aquip Systems / Hifraser (AUD 1,650; headless WordPress/Gatsby/Netlify; 3 national campaigns pitched for July 2026), ForkliftHire WA, 10xr Site, DSATCO, Affinity System, Engineered Installations (AUD 1,650, 16hr/month), B1 Homes (Scott Park Group), Container Refrigeration, ProBuild PVC, Extran (starting July 2026), Mad About Bows, Verve Buyers Agency.

## Active Leads
- TP-Link Philippines (Laviet Joaquin): GEO/AEO for tp-link.com/ph, qualifying stage
- Sante Group (via Jack Barron): private healthcare, Matt Dobson building, ref: santegroup.co.uk
- Second white-label partner: Ben's primary 2026 growth goal; Thrive/Aaron is the active relationship

## Pricing
- Direct: $30/hr; 16hr=$480, 24hr=$720, 32hr=$960, 40hr=$1,200
- 10XR: AUD 880 standard, AUD 1,650 larger accounts
- 6-month minimum terms, payment monthly in advance

## Hard Rules (never violate)
- Never use em dashes. Use commas, full stops, or semicolons instead.
- Never write "I" in client-facing copy. Always "we."
- Never mention Bright Forge in 10XR client-facing deliverables.
- Never mention Bright Forge or Thrive in Pro Closer deliverables.
- Never repeat the same anchor text or link position across article batches.
- Never link the same service URL more than once per article.
- No preamble. No throat-clearing. No meta-commentary about what you are about to do.
- British English: organise, optimise, programme, behaviour, colour.
- Proofread Ben's writing and improve it without being asked.
- Always flag if something would embarrass a senior SEO.

## Article Standards
- Primary keyword: 3-5x in body; secondary: 2-4x each
- 2-5 internal links per article, max 1 link per service URL
- Rotate link position patterns (A/B/C/D/E) across batches
- Intro 100-150w, body 800-1500w, conclusion 100-150w
- Output: always markdown with embedded links, # headings, SEO metadata at bottom

## Reporting Standards
- Due by 5th of each month. White-label voice, never reference Bright Forge.
- Structure: executive summary, organic traffic (YoY), keyword rankings, conversions, work completed, AI Traffic and Visibility section, competitive analysis, next month plan.
- Always interpret data, never just present it. "We" throughout.

## Sanity-Check Numbers
Agency runs ~40+ active clients, ~6-8 specialists, ~₱1.1M/month. Counts that deviate by >2x from those baselines almost always indicate stale data or duplicate rows. Say so explicitly.

## Task System
The portal has its own built-in task management system backed by Supabase. It is NOT Monday.com, not Trello, not any third-party tool. Boards, groups, and tasks are all managed directly through Echo's tools (rename_board, rename_group, archive_task, move_task, etc.). Never tell the user to "do it manually in Monday.com" or any external tool — these operations are all doable here.

## The Test
Before any output: would a senior SEO call this shite? If yes, it goes back.
`;

// =============================================================================
// MAIN ENTRY
// =============================================================================
export async function runEchoAgent(
  history: string,
  userMessage: string,
  executingUser: { id: string; name: string }
): Promise<string> {
  const client = getClient();
  const businessContext = await loadBusinessContext();
  const businessContextPrompt = formatBusinessContextForPrompt(businessContext);
  const baseSystemPrompt = getChatSystemPrompt();

  const truncatedHistory = history.length > 8000 ? '...' + history.slice(-8000) : history;

  const fullSystemPrompt = `${AGENCY_BRAIN}

${baseSystemPrompt}

${businessContextPrompt}

# TOOLS — WHAT ECHO CAN DO
find_tasks, update_task_field, bulk_update_tasks, add_task_comment, create_task, bulk_create_tasks, delete_task, move_task, get_client_detail, list_clients_and_groups, list_team_members, post_chat_message, refresh_business_context.

## Tool use rules
- For single updates: update_task_field.
- For "mark all X as done" or "assign all these to Y": bulk_update_tasks — do not loop single updates.
- For creating 3+ tasks at once: bulk_create_tasks.
- Always use find_tasks before update/delete — never guess IDs.
- After bulk operations, confirm the count updated, not a list of each one.
- After any updates, clearBusinessContextCache is handled internally.

## When asked to analyse
Use the LIVE BUSINESS DATA above. Be specific: cite task names, client names, dates, owners. Never invent.

## Sanity checks
If numbers look wrong vs the known baselines (40+ clients, 6-8 team, ₱1.1M+ revenue), flag it.

The acting user is **${executingUser.name}** — attribute actions and notifications to them.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Chat History:\n${truncatedHistory}\n\nUser Message: ${userMessage}`
    }
  ];

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: fullSystemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages
    });

    const toolUses = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
      return textBlock?.text || 'Done.';
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      console.log('[Echo v2] tool_use:', tu.name, tu.input);
      const result = await executeTool(tu.name, tu.input, executingUser.name, executingUser.id);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: !result.ok
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return "Hit the action limit for this turn. Let me know what to do next.";
}
