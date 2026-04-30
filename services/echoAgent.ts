/**
 * Echo Agent — chat with tool use.
 *
 * Echo can call tools to actually DO things in the app: find tasks, update them,
 * add comments, create new tasks. Implements the standard Anthropic tool-use loop:
 *
 *   1) send messages + tool definitions
 *   2) model returns either text (done) or tool_use blocks
 *   3) we execute tools, return tool_result blocks
 *   4) loop until model returns text or we hit MAX_HOPS
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabaseClient';
import { ClientBoard, Task } from '../types';
import { fetchClientBoards, saveClientBoard, fetchProfiles, sendChatMessage, fetchChannels, createNotification } from './databaseService';
import { loadBusinessContext, formatBusinessContextForPrompt, clearBusinessContextCache } from './businessContextLoader';
import { getChatSystemPrompt } from './skillsLoader';

// API key parts (matches the rest of the codebase)
const K1 = 'sk-ant-api03-FM3mh6FtduBlSZR63Sdx8zM2xsKNtuE';
const K2 = '_IxCsXAgHA-QFdT-0P2Ip3Tpypg7SVQAPr8TA7p0S2dvHyFi9D0mpjQ-z388AAAA';
// Sonnet 4.6 — best reasoning/speed combo, strong tool-use planning.
// Haiku was too eager to hallucinate numbers when data was noisy; Sonnet handles
// risk analysis, multi-step reasoning, and follow-through on tools better.
const CLAUDE_SONNET = 'claude-sonnet-4-6';

const MAX_HOPS = 6;        // safety cap on tool-use iterations
const MAX_TOKENS = 3072;   // higher ceiling so multi-step plans don't get truncated

const getClient = () => new Anthropic({ apiKey: K1 + K2, dangerouslyAllowBrowser: true });

// =============================================================================
// TOOL DEFINITIONS — what Echo is allowed to do
// =============================================================================
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_tasks',
    description: 'Search for tasks across all client boards by partial title match, client name, or assignee name. Returns up to 10 matching tasks with their IDs (needed for any update/comment action).',
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
    description: 'Update a single field on a task. Use find_tasks first to get the IDs. The field can be: status, priority, dueDate, title, description, assignedTo. For status/priority pass the LABEL (e.g. "Done", "High") — Echo will resolve to the right ID.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Board (client) ID from find_tasks' },
        groupId: { type: 'string', description: 'Group ID from find_tasks' },
        taskId: { type: 'string', description: 'Task ID from find_tasks' },
        field: {
          type: 'string',
          enum: ['status', 'priority', 'dueDate', 'title', 'description', 'assignedTo'],
          description: 'Which field to update'
        },
        value: { type: 'string', description: 'New value. For status/priority pass the label (e.g. "Done", "Working on it"). For dueDate pass YYYY-MM-DD. For assignedTo pass profile ID(s) comma-separated.' }
      },
      required: ['boardId', 'groupId', 'taskId', 'field', 'value']
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
    description: 'Create a new task on a client board. Returns the new task ID. Use find_tasks first if you need to discover the board/group ID.',
    input_schema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Board (client) ID' },
        groupId: { type: 'string', description: 'Group ID where the task should land' },
        title: { type: 'string' },
        description: { type: 'string', description: 'Optional description' },
        dueDate: { type: 'string', description: 'Optional YYYY-MM-DD' },
        assignedTo: { type: 'string', description: 'Optional profile ID(s) comma-separated' }
      },
      required: ['boardId', 'groupId', 'title']
    }
  },
  {
    name: 'list_clients_and_groups',
    description: 'List all client boards with their group IDs and names. Useful when creating a task and you need to know which board/group to put it in.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'list_team_members',
    description: 'List team profiles (id + full_name). Use to resolve a name like "Ben" to a profile ID before passing to update_task_field assignedTo.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'post_chat_message',
    description: 'Post a chat message into a channel as Echo. Use sparingly — only when the user explicitly asks Echo to broadcast or post on their behalf.',
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
    description: 'Force-refresh the cached business context (clients, tasks, comments, chat). Use if the user says data looks stale or after you made several updates.',
    input_schema: { type: 'object', properties: {}, required: [] }
  }
];

// =============================================================================
// TOOL EXECUTION — runs locally against Supabase
// =============================================================================

interface ToolResult { ok: boolean; data?: any; error?: string }

const resolveStatusOrPriorityId = (board: ClientBoard, type: 'status' | 'priority', label: string): string | null => {
  const defs = type === 'status' ? board.statusDefs : board.priorityDefs;
  if (!defs) return null;
  const lower = label.toLowerCase().trim();
  // Exact label match first, then contains
  const exact = defs.find(d => d.label.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = defs.find(d => d.label.toLowerCase().includes(lower) || lower.includes(d.label.toLowerCase()));
  return partial?.id || null;
};

async function executeTool(name: string, input: any, executingUserName: string, executingUserId: string): Promise<ToolResult> {
  try {
    switch (name) {
      case 'find_tasks': {
        const boards = await fetchClientBoards();
        const profiles = await fetchProfiles();
        const profileMap = new Map(profiles.map(p => [p.id, p.full_name || '']));
        const q = (input.query || '').toLowerCase();
        const onlyOpen = input.only_open !== false;
        const completedKeywords = ['done', 'complete', 'finished', 'closed', 'approved', 'shipped', 'delivered'];
        const matches: any[] = [];

        for (const board of boards) {
          for (const group of board.groups || []) {
            for (const task of group.tasks || []) {
              const statusDef = board.statusDefs?.find(s => s.id === task.status);
              const statusLabel = statusDef?.label || '';
              const isDone = completedKeywords.some(k => statusLabel.toLowerCase().includes(k));
              if (onlyOpen && isDone) continue;

              const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
              const assignedNames = assignedIds.map(id => profileMap.get(id) || '').filter(Boolean);
              const haystack = [
                task.title,
                task.description || '',
                board.name,
                statusLabel,
                ...assignedNames
              ].join(' ').toLowerCase();

              if (haystack.includes(q)) {
                matches.push({
                  taskId: task.id,
                  boardId: board.id,
                  groupId: group.id,
                  title: task.title,
                  clientName: board.name,
                  status: statusLabel,
                  dueDate: task.dueDate || null,
                  assignedTo: assignedNames,
                  isOverdue: task.dueDate ? new Date(task.dueDate) < new Date() && !isDone : false
                });
                if (matches.length >= 10) break;
              }
            }
            if (matches.length >= 10) break;
          }
          if (matches.length >= 10) break;
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

        // Notify newly-assigned users (if any)
        if (field === 'assignedTo') {
          const ids = Array.isArray(newValue) ? newValue : [newValue];
          for (const uid of ids) {
            if (uid && uid !== executingUserId) {
              try {
                await createNotification(
                  uid,
                  `Echo assigned you a task`,
                  `"${task.title}" on ${board.name}`,
                  'message',
                  'TASKS',
                  { taskId: task.id, boardId: board.id, groupId: group.id, boardName: board.name }
                );
              } catch (e) { console.error('[Echo] assignment notify failed:', e); }
            }
          }
        }

        return { ok: true, data: { taskId, field, value: newValue, taskTitle: task.title } };
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
          status: board.statusDefs[board.statusDefs.length - 1]?.id || '',
          priority: board.priorityDefs[board.priorityDefs.length - 1]?.id || '',
          dueDate: dueDate || new Date().toISOString().split('T')[0],
          assignedTo: assignedTo
            ? (assignedTo.includes(',') ? assignedTo.split(',').map((s: string) => s.trim()) : assignedTo)
            : ''
        };
        group.tasks = [...(group.tasks || []), newTask];
        await saveClientBoard(board);
        clearBusinessContextCache();

        // Notify assignees
        const ids = Array.isArray(newTask.assignedTo) ? newTask.assignedTo : (newTask.assignedTo ? [newTask.assignedTo] : []);
        for (const uid of ids) {
          if (uid && uid !== executingUserId) {
            try {
              await createNotification(
                uid,
                'Echo assigned you a task',
                `"${newTask.title}" on ${board.name}`,
                'message',
                'TASKS',
                { taskId: newTask.id, boardId: board.id, groupId: group.id, boardName: board.name }
              );
            } catch (e) { console.error('[Echo] new-task notify failed:', e); }
          }
        }

        return { ok: true, data: { taskId: newTask.id, boardName: board.name, groupName: group.title } };
      }

      case 'list_clients_and_groups': {
        const boards = await fetchClientBoards();
        const summary = boards.map(b => ({
          boardId: b.id,
          boardName: b.name,
          groups: (b.groups || []).map(g => ({ groupId: g.id, groupName: g.title, taskCount: g.tasks?.length || 0 }))
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

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// =============================================================================
// MAIN ENTRY — replacement for getClaudeChatResponse with tool-use loop
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

  const truncatedHistory = history.length > 6000 ? '...' + history.slice(-6000) : history;

  const fullSystemPrompt = `${baseSystemPrompt}

${businessContextPrompt}

# YOU CAN ACT, NOT JUST TALK
You have tools: find_tasks, update_task_field, add_task_comment, create_task, list_clients_and_groups, list_team_members, post_chat_message, refresh_business_context.

When the user asks you to DO something (e.g. "mark the homepage redesign task as done", "assign this to Ben", "add a comment that says X", "create a task for Acme to fix their schema"):
1. Use find_tasks first to get the real IDs (don't guess them).
2. Call the appropriate update/create tool.
3. Confirm what you did with specifics — "Updated 'Homepage redesign' for Acme Co. to status: Done."

When the user asks you to ANALYZE (e.g. "what's at risk this week?", "who's overloaded?"):
- Use the LIVE BUSINESS DATA above plus the Auto-Detected Risks section.
- Be specific: cite task names, client names, dates, owners. Never invent.

# SANITY-CHECK NUMBERS BEFORE QUOTING THEM
The data you receive is already deduped, but if a number looks wrong (per the
MASTER KNOWLEDGE BASE: agency runs ~40+ active clients, ~6-8 specialists, ~₱1.1M/mo
revenue, white-label-heavy), call it out instead of repeating it. Counts that
deviate by >2x from those baselines almost always indicate stale data or
duplicate rows — say so explicitly.

# AUTHORITATIVE KNOWLEDGE
The MASTER KNOWLEDGE BASE in your knowledge section is Ben's own operating doc
for Bright Forge SEO. When voice, methodology, pricing, processes, or
positioning come up, quote/apply that doc, not generic SEO best practices.
Voice rules from that doc apply to everything you write or say:
- British English (organise, optimise, programme, behaviour)
- Direct, opinionated, light dry humour, never robotic
- No filler ("crucial", "leverage", "delve", "in today's digital landscape")
- Lead with the answer, not preamble

The acting user is **${executingUser.name}** — attribute actions and notifications to them.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Chat History:
${truncatedHistory}

User Message: ${userMessage}`
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

    // If model returned plain text (no tool use), we're done
    const toolUses = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
      return textBlock?.text || 'Done.';
    }

    // Execute every tool use returned in this turn
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      console.log('[Echo] tool_use:', tu.name, tu.input);
      const result = await executeTool(tu.name, tu.input, executingUser.name, executingUser.id);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: !result.ok
      });
    }

    // Append assistant turn + our tool_result turn, loop back
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return "I've hit my action limit for this turn — let me know what to do next.";
}
