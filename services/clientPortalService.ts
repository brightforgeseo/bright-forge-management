import { supabase, supabaseAdmin } from '../lib/supabaseClient';
import {
  PartnerAccount,
  PartnerClientAccess,
  PartnerTask,
  PartnerTaskStatus,
  PartnerMessage,
  PartnerEmail,
  PartnerWithStats,
  PortalStats,
  GeneratedEmail,
  EmailGenerationContext,
  TaskComment as PortalTaskComment,
  PreviousTaskSummary,
} from '../types-portal';
import { ClientBoard, TaskComment } from '../types';
import { generateClientEmail } from './geminiService';

// ============================================
// PARTNER ACCOUNT OPERATIONS
// ============================================

export const fetchPartnerAccount = async (partnerId: string): Promise<PartnerAccount | null> => {
  const { data, error } = await supabase
    .from('partner_accounts')
    .select('*')
    .eq('id', partnerId)
    .single();

  if (error) {
    console.error('[fetchPartnerAccount] Error:', error.message);
    return null;
  }

  return data as PartnerAccount;
};

export const updatePartnerAccount = async (
  partnerId: string,
  updates: Partial<PartnerAccount>
): Promise<boolean> => {
  const { error } = await supabase
    .from('partner_accounts')
    .update(updates)
    .eq('id', partnerId);

  if (error) {
    console.error('[updatePartnerAccount] Error:', error.message);
    return false;
  }

  return true;
};

export const updatePartnerLastLogin = async (partnerId: string): Promise<void> => {
  await supabase
    .from('partner_accounts')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', partnerId);
};

// ============================================
// PARTNER CLIENT ACCESS
// ============================================

export const fetchPartnerClients = async (partnerId: string): Promise<ClientBoard[]> => {
  // Get the client board IDs this partner has access to
  const { data: accessData, error: accessError } = await supabase
    .from('partner_client_access')
    .select('client_board_id')
    .eq('partner_id', partnerId);

  if (accessError || !accessData?.length) {
    console.error('[fetchPartnerClients] Error or no access:', accessError?.message);
    return [];
  }

  const clientBoardIds = accessData.map(a => a.client_board_id);

  // Fetch the actual client boards
  const { data: boardsData, error: boardsError } = await supabase
    .from('client_boards')
    .select('*')
    .order('created_at', { ascending: false });

  if (boardsError) {
    console.error('[fetchPartnerClients] Error fetching boards:', boardsError.message);
    return [];
  }

  // Filter to only boards the partner has access to
  const boards: ClientBoard[] = [];
  const seenIds = new Set<string>();

  for (const row of boardsData || []) {
    const boardData = row.board_data as ClientBoard;
    if (boardData && clientBoardIds.includes(boardData.id) && !seenIds.has(boardData.id)) {
      seenIds.add(boardData.id);
      boards.push(boardData);
    }
  }

  return boards;
};

export const grantClientAccess = async (
  partnerId: string,
  clientBoardId: string,
  grantedBy: string
): Promise<boolean> => {
  const { error } = await supabaseAdmin
    .from('partner_client_access')
    .insert({
      partner_id: partnerId,
      client_board_id: clientBoardId,
      granted_by: grantedBy,
    });

  if (error) {
    console.error('[grantClientAccess] Error:', error.message);
    return false;
  }

  return true;
};

export const revokeClientAccess = async (
  partnerId: string,
  clientBoardId: string
): Promise<boolean> => {
  const { error } = await supabaseAdmin
    .from('partner_client_access')
    .delete()
    .eq('partner_id', partnerId)
    .eq('client_board_id', clientBoardId);

  if (error) {
    console.error('[revokeClientAccess] Error:', error.message);
    return false;
  }

  return true;
};

// ============================================
// PARTNER TASKS
// ============================================

export const fetchPartnerTasks = async (partnerId: string): Promise<PartnerTask[]> => {
  const { data, error } = await supabase
    .from('partner_tasks')
    .select('*')
    .eq('partner_id', partnerId)
    .order('assigned_at', { ascending: false });

  if (error) {
    console.error('[fetchPartnerTasks] Error:', error.message);
    return [];
  }

  return data as PartnerTask[];
};

export const fetchPartnerTasksByClient = async (
  partnerId: string,
  clientBoardId: string
): Promise<PartnerTask[]> => {
  const { data, error } = await supabase
    .from('partner_tasks')
    .select('*')
    .eq('partner_id', partnerId)
    .eq('client_board_id', clientBoardId)
    .order('assigned_at', { ascending: false });

  if (error) {
    console.error('[fetchPartnerTasksByClient] Error:', error.message);
    return [];
  }

  return data as PartnerTask[];
};

const COMPLETED_STATUS_KEYWORDS = ['done', 'complete', 'finished', 'closed', 'approved', 'shipped', 'delivered', 'resolved', 'sent to client', 'ben to check', 'archived'];
const COMPLETED_STATUS_COLORS = ['#00c875', '#00ca72', '#22c55e', '#16a34a', '#15803d', '#166534', '#4ade80', '#86efac', 'green'];
const COMPLETED_GROUP_TITLES = ['done', 'completed', 'cancelled', 'canceled', 'archived', 'closed'];

// Helper to check if a status indicates task is done/completed
const isCompletedStatus = (statusId: string, statusDefs: any[]): boolean => {
  if (!statusDefs || !statusId) return false;

  const statusDef = statusDefs.find((s: any) => s.id === statusId);
  if (!statusDef) return false;

  const label = (statusDef.label || '').toLowerCase();
  const color = (statusDef.color || '').toLowerCase();

  if (COMPLETED_STATUS_KEYWORDS.some(keyword => label.includes(keyword))) return true;
  if (COMPLETED_STATUS_COLORS.includes(color)) return true;

  return false;
};

// Many client boards use a physical group called "Done" rather than changing each task status.
// Treating those tasks as active makes partner/client dashboards show nonsense totals like 150+ tasks.
const isCompletedGroup = (groupTitle?: string): boolean => {
  const title = (groupTitle || '').trim().toLowerCase();
  return COMPLETED_GROUP_TITLES.includes(title);
};

const isClientBoardTaskCompleted = (statusId: string, statusDefs: any[], groupTitle?: string): boolean => {
  return isCompletedStatus(statusId, statusDefs) || isCompletedGroup(groupTitle);
};

// Fetch ALL tasks from client boards the partner has access to
// Partners automatically see all tasks without explicit assignment
export const fetchAllClientTasksForPartner = async (
  partnerId: string
): Promise<{ tasks: PartnerTask[]; clients: ClientBoard[] }> => {
  // Get clients the partner has access to
  const clients = await fetchPartnerClients(partnerId);

  if (!clients.length) {
    return { tasks: [], clients: [] };
  }

  // Get existing partner_tasks entries to preserve status tracking
  const { data: existingTasks } = await supabase
    .from('partner_tasks')
    .select('*')
    .eq('partner_id', partnerId);

  const existingTaskMap = new Map<string, PartnerTask>();
  for (const task of existingTasks || []) {
    existingTaskMap.set(task.task_id, task as PartnerTask);
  }

  // Extract all tasks from all accessible client boards
  const allTasks: PartnerTask[] = [];

  for (const client of clients) {
    // Get status definitions for this client to check completion
    const statusDefs = (client as any).statusDefs || [];

    for (const group of client.groups || []) {
      for (const task of group.tasks || []) {
        const existingEntry = existingTaskMap.get(task.id);

        // Check if task is marked as done in main portal
        const isMainTaskDone = isClientBoardTaskCompleted(task.status, statusDefs, group.title);

        // Determine partner status:
        // - If main task is done, show as completed
        // - Otherwise use existing partner status or default to 'assigned'
        let partnerStatus: PartnerTaskStatus = existingEntry?.partner_status || 'assigned';
        if (isMainTaskDone) {
          partnerStatus = 'completed';
        }

        // Create a PartnerTask object with enriched data
        const partnerTask: PartnerTask = {
          id: existingEntry?.id || `temp-${task.id}`, // Use existing ID or temp ID
          partner_id: partnerId,
          client_board_id: client.id,
          task_id: task.id,
          group_id: group.id,
          visible_notes: existingEntry?.visible_notes,
          partner_status: partnerStatus,
          assigned_at: existingEntry?.assigned_at || new Date().toISOString(),
          assigned_by: existingEntry?.assigned_by,
          completed_at: isMainTaskDone ? (existingEntry?.completed_at || new Date().toISOString()) : existingEntry?.completed_at,
          // Enriched data
          task: task,
          client_name: client.name,
          group_title: group.title,
        };

        allTasks.push(partnerTask);
      }
    }
  }

  return { tasks: allTasks, clients };
};

// Upsert partner task status - creates entry if doesn't exist, updates if it does
export const upsertPartnerTaskStatus = async (
  partnerId: string,
  clientBoardId: string,
  taskId: string,
  groupId: string,
  status: PartnerTaskStatus
): Promise<{ success: boolean; taskEntry: PartnerTask | null }> => {
  const updates: any = { partner_status: status };
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  // Try to update first
  const { data: existingData } = await supabase
    .from('partner_tasks')
    .select('*')
    .eq('partner_id', partnerId)
    .eq('task_id', taskId)
    .single();

  if (existingData) {
    // Update existing entry
    const { data, error } = await supabase
      .from('partner_tasks')
      .update(updates)
      .eq('id', existingData.id)
      .select()
      .single();

    if (error) {
      console.error('[upsertPartnerTaskStatus] Update error:', error.message);
      return { success: false, taskEntry: null };
    }

    return { success: true, taskEntry: data as PartnerTask };
  } else {
    // Create new entry
    const { data, error } = await supabase
      .from('partner_tasks')
      .insert({
        partner_id: partnerId,
        task_id: taskId,
        group_id: groupId,
        client_board_id: clientBoardId,
        partner_status: status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      console.error('[upsertPartnerTaskStatus] Insert error:', error.message);
      return { success: false, taskEntry: null };
    }

    return { success: true, taskEntry: data as PartnerTask };
  }
};

export const updatePartnerTaskStatus = async (
  taskId: string,
  status: PartnerTaskStatus
): Promise<boolean> => {
  const updates: any = { partner_status: status };
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('partner_tasks')
    .update(updates)
    .eq('id', taskId);

  if (error) {
    console.error('[updatePartnerTaskStatus] Error:', error.message);
    return false;
  }

  return true;
};

// Add a comment to a task (updates the client_boards JSONB)
export const addCommentToTask = async (
  clientBoardId: string,
  groupId: string,
  taskId: string,
  comment: TaskComment
): Promise<boolean> => {
  try {
    // Fetch the current client board data
    const { data: boardsData, error: fetchError } = await supabaseAdmin
      .from('client_boards')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[addCommentToTask] Fetch error:', fetchError.message);
      return false;
    }

    // Find the board with matching ID
    let targetRow: any = null;
    for (const row of boardsData || []) {
      const boardData = row.board_data as ClientBoard;
      if (boardData && boardData.id === clientBoardId) {
        targetRow = row;
        break;
      }
    }

    if (!targetRow) {
      console.error('[addCommentToTask] Board not found:', clientBoardId);
      return false;
    }

    const boardData = targetRow.board_data as ClientBoard;

    // Find the group and task, then add the comment
    let found = false;
    for (const group of boardData.groups || []) {
      if (group.id === groupId) {
        for (const task of group.tasks || []) {
          if (task.id === taskId) {
            if (!task.comments) {
              task.comments = [];
            }
            task.comments.push(comment);
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }

    if (!found) {
      console.error('[addCommentToTask] Task not found:', taskId);
      return false;
    }

    // Update the board data
    const { error: updateError } = await supabaseAdmin
      .from('client_boards')
      .update({ board_data: boardData, updated_at: new Date().toISOString() })
      .eq('id', targetRow.id);

    if (updateError) {
      console.error('[addCommentToTask] Update error:', updateError.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[addCommentToTask] Unexpected error:', err);
    return false;
  }
};

export const assignTaskToPartner = async (
  partnerId: string,
  clientBoardId: string,
  taskId: string,
  groupId: string,
  visibleNotes?: string
): Promise<boolean> => {
  const { error } = await supabaseAdmin
    .from('partner_tasks')
    .insert({
      partner_id: partnerId,
      task_id: taskId,
      group_id: groupId,
      client_board_id: clientBoardId,
      visible_notes: visibleNotes || null,
    });

  if (error) {
    console.error('[assignTaskToPartner] Error:', error.message);
    return false;
  }

  return true;
};

export const unassignTaskFromPartner = async (
  partnerId: string,
  taskId: string
): Promise<boolean> => {
  const { error } = await supabaseAdmin
    .from('partner_tasks')
    .delete()
    .eq('partner_id', partnerId)
    .eq('task_id', taskId);

  if (error) {
    console.error('[unassignTaskFromPartner] Error:', error.message);
    return false;
  }

  return true;
};

// ============================================
// PARTNER MESSAGES (1:1 with Ben)
// ============================================

export const fetchPartnerMessages = async (
  partnerId: string,
  limit: number = 100
): Promise<PartnerMessage[]> => {
  const { data, error } = await supabaseAdmin
    .from('partner_messages')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[fetchPartnerMessages] Error:', error.message);
    return [];
  }

  return data as PartnerMessage[];
};

export const sendPartnerMessage = async (
  partnerId: string,
  text: string,
  senderType: 'partner' | 'team',
  senderId: string,
  senderName: string,
  attachmentUrl?: string,
  attachmentType?: 'image' | 'file',
  attachmentName?: string
): Promise<PartnerMessage | null> => {
  const { data, error } = await supabaseAdmin
    .from('partner_messages')
    .insert({
      partner_id: partnerId,
      sender_type: senderType,
      sender_id: senderId,
      sender_name: senderName,
      text,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      attachment_name: attachmentName,
    })
    .select()
    .single();

  if (error) {
    console.error('[sendPartnerMessage] Error:', error.message);
    return null;
  }

  return data as PartnerMessage;
};

export const markPartnerMessagesRead = async (
  partnerId: string,
  senderType: 'partner' | 'team'
): Promise<boolean> => {
  // Mark messages from the other party as read
  const { error } = await supabaseAdmin
    .from('partner_messages')
    .update({ is_read: true })
    .eq('partner_id', partnerId)
    .neq('sender_type', senderType)
    .eq('is_read', false);

  if (error) {
    console.error('[markPartnerMessagesRead] Error:', error.message);
    return false;
  }

  return true;
};

export const getUnreadMessageCount = async (
  partnerId: string,
  forPartner: boolean = true
): Promise<number> => {
  const senderType = forPartner ? 'team' : 'partner';
  const { count, error } = await supabaseAdmin
    .from('partner_messages')
    .select('*', { count: 'exact', head: true })
    .eq('partner_id', partnerId)
    .eq('sender_type', senderType)
    .eq('is_read', false);

  if (error) {
    console.error('[getUnreadMessageCount] Error:', error.message);
    return 0;
  }

  return count || 0;
};

// Subscribe to new messages (for real-time updates)
export const subscribeToPartnerMessages = (
  partnerId: string,
  callback: (message: PartnerMessage) => void
) => {
  return supabase
    .channel(`partner_messages_${partnerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'partner_messages',
        filter: `partner_id=eq.${partnerId}`,
      },
      (payload) => {
        callback(payload.new as PartnerMessage);
      }
    )
    .subscribe();
};

// ============================================
// PARTNER EMAILS
// ============================================

export const createEmailDraft = async (
  partnerId: string,
  taskId: string | null,
  clientEmail: string,
  clientName: string,
  subject: string,
  body: string,
  aiGenerated: boolean = false
): Promise<PartnerEmail | null> => {
  const { data, error } = await supabase
    .from('partner_emails')
    .insert({
      partner_id: partnerId,
      task_id: taskId,
      client_email: clientEmail,
      client_name: clientName,
      subject,
      body,
      ai_generated: aiGenerated,
    })
    .select()
    .single();

  if (error) {
    console.error('[createEmailDraft] Error:', error.message);
    return null;
  }

  return data as PartnerEmail;
};

export const updateEmailDraft = async (
  emailId: string,
  updates: Partial<Pick<PartnerEmail, 'subject' | 'body' | 'status'>>
): Promise<boolean> => {
  const { error } = await supabase
    .from('partner_emails')
    .update(updates)
    .eq('id', emailId);

  if (error) {
    console.error('[updateEmailDraft] Error:', error.message);
    return false;
  }

  return true;
};

export const markEmailSent = async (emailId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('partner_emails')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('id', emailId);

  if (error) {
    console.error('[markEmailSent] Error:', error.message);
    return false;
  }

  return true;
};

export const markEmailFailed = async (emailId: string, errorMessage: string): Promise<boolean> => {
  const { error } = await supabase
    .from('partner_emails')
    .update({
      status: 'failed',
      error_message: errorMessage,
    })
    .eq('id', emailId);

  if (error) {
    console.error('[markEmailFailed] Error:', error.message);
    return false;
  }

  return true;
};

export const fetchPartnerEmails = async (partnerId: string): Promise<PartnerEmail[]> => {
  const { data, error } = await supabase
    .from('partner_emails')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchPartnerEmails] Error:', error.message);
    return [];
  }

  return data as PartnerEmail[];
};

// ============================================
// EMAIL CONNECTION (OAuth tokens)
// ============================================

export const saveEmailCredentials = async (
  partnerId: string,
  provider: 'gmail' | 'outlook',
  accessToken: string,
  refreshToken: string,
  expiresAt: string,
  emailAddress: string
): Promise<boolean> => {
  const { error } = await supabase
    .from('partner_accounts')
    .update({
      email_provider: provider,
      email_access_token: accessToken,
      email_refresh_token: refreshToken,
      email_token_expires_at: expiresAt,
      email_address: emailAddress,
    })
    .eq('id', partnerId);

  if (error) {
    console.error('[saveEmailCredentials] Error:', error.message);
    return false;
  }

  return true;
};

export const disconnectEmail = async (partnerId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('partner_accounts')
    .update({
      email_provider: null,
      email_access_token: null,
      email_refresh_token: null,
      email_token_expires_at: null,
      email_address: null,
    })
    .eq('id', partnerId);

  if (error) {
    console.error('[disconnectEmail] Error:', error.message);
    return false;
  }

  return true;
};

// ============================================
// PORTAL STATS
// ============================================

export const fetchPortalStats = async (partnerId: string): Promise<PortalStats> => {
  const [{ tasks, clients }, emails, unread] = await Promise.all([
    fetchAllClientTasksForPartner(partnerId),
    fetchPartnerEmails(partnerId),
    getUnreadMessageCount(partnerId, true),
  ]);

  const completedTasks = tasks.filter(t => t.partner_status === 'completed');
  const pendingTasks = tasks.filter(t => t.partner_status !== 'completed');
  const sentEmails = emails.filter(e => e.status === 'sent');

  return {
    totalClients: clients.length,
    totalTasks: tasks.length,
    pendingTasks: pendingTasks.length,
    completedTasks: completedTasks.length,
    emailsSent: sentEmails.length,
    unreadMessages: unread,
  };
};

// ============================================
// ADMIN OPERATIONS
// ============================================

// Create a new partner account
export const createPartnerAccount = async (
  email: string,
  password: string,
  companyName: string,
  fullName: string
): Promise<PartnerAccount | null> => {
  try {
    // Create user in Supabase Auth with partner metadata
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        user_type: 'partner',
        company_name: companyName,
        full_name: fullName,
      },
    });

    if (authError) {
      console.error('[createPartnerAccount] Auth error:', authError.message);
      return null;
    }

    // Create partner_accounts record (use admin client to bypass RLS)
    const { data, error } = await supabaseAdmin
      .from('partner_accounts')
      .insert({
        id: authData.user.id,
        email,
        company_name: companyName,
        full_name: fullName,
      })
      .select()
      .single();

    if (error) {
      console.error('[createPartnerAccount] DB error:', error.message);
      // Clean up auth user if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return null;
    }

    return data as PartnerAccount;
  } catch (err) {
    console.error('[createPartnerAccount] Unexpected error:', err);
    return null;
  }
};

// Fetch all partners (for admin view) - uses admin client to bypass RLS
export const fetchAllPartners = async (): Promise<PartnerWithStats[]> => {
  const { data, error } = await supabaseAdmin
    .from('partner_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchAllPartners] Error:', error.message);
    return [];
  }

  // Enrich with stats
  const partnersWithStats: PartnerWithStats[] = [];
  for (const partner of data as PartnerAccount[]) {
    const [clients, tasks, unread, lastMessage] = await Promise.all([
      supabaseAdmin
        .from('partner_client_access')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partner.id),
      supabaseAdmin
        .from('partner_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partner.id),
      getUnreadMessageCount(partner.id, false),
      supabaseAdmin
        .from('partner_messages')
        .select('created_at')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    partnersWithStats.push({
      ...partner,
      clientCount: clients.count || 0,
      taskCount: tasks.count || 0,
      unreadMessages: unread,
      lastMessageAt: lastMessage.data?.created_at,
    });
  }

  return partnersWithStats;
};

// Delete a partner account
export const deletePartnerAccount = async (partnerId: string): Promise<boolean> => {
  try {
    // Delete from Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(partnerId);
    if (authError) {
      console.error('[deletePartnerAccount] Auth error:', authError.message);
    }

    // Delete from partner_accounts (cascades to related tables)
    const { error } = await supabaseAdmin
      .from('partner_accounts')
      .delete()
      .eq('id', partnerId);

    if (error) {
      console.error('[deletePartnerAccount] DB error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[deletePartnerAccount] Unexpected error:', err);
    return false;
  }
};

// Toggle partner active status
export const togglePartnerActive = async (
  partnerId: string,
  isActive: boolean
): Promise<boolean> => {
  const { error } = await supabaseAdmin
    .from('partner_accounts')
    .update({ is_active: isActive })
    .eq('id', partnerId);

  if (error) {
    console.error('[togglePartnerActive] Error:', error.message);
    return false;
  }

  return true;
};

// ============================================
// EMAIL GENERATION (uses Gemini Haiku 3.5)
// ============================================

// Helper to fetch previous tasks for a client to give AI context about the SEO project
const fetchPreviousTasksForClient = async (
  clientBoardId: string,
  excludeTaskId: string
): Promise<PreviousTaskSummary[]> => {
  try {
    // Get the client board data
    const { data: boardData } = await supabase
      .from('client_boards')
      .select('board_data')
      .single();

    if (!boardData?.board_data) return [];

    const board = boardData.board_data;
    if (board.id !== clientBoardId) return [];

    const previousTasks: PreviousTaskSummary[] = [];

    // Extract tasks from all groups
    for (const group of board.groups || []) {
      for (const task of group.tasks || []) {
        if (task.id === excludeTaskId) continue;
        previousTasks.push({
          title: task.title,
          status: task.status || 'Unknown',
          completedAt: task.status === 'Done' ? task.updatedAt : undefined,
        });
      }
    }

    // Return last 10 tasks
    return previousTasks.slice(-10);
  } catch (err) {
    console.error('[fetchPreviousTasksForClient] Error:', err);
    return [];
  }
};

// Helper to extract comments from a task
const extractTaskComments = (task: any): PortalTaskComment[] => {
  if (!task?.comments || !Array.isArray(task.comments)) return [];

  return task.comments.map((comment: any) => ({
    author: comment.userName || 'Team Member',
    text: comment.text || '',
    createdAt: comment.createdAt
      ? new Date(comment.createdAt).toLocaleDateString()
      : 'Unknown date',
  }));
};

export const generateEmailWithAI = async (
  context: EmailGenerationContext,
  task?: any, // Optional full task object with comments
  clientBoardId?: string
): Promise<GeneratedEmail | null> => {
  try {
    // Enrich context with task comments if task provided
    let enrichedContext = { ...context };

    if (task) {
      // Extract comments from task
      enrichedContext.taskComments = extractTaskComments(task);

      // Get task status and due date
      enrichedContext.taskStatus = task.status;
      enrichedContext.taskDueDate = task.dueDate
        ? new Date(task.dueDate).toLocaleDateString()
        : undefined;
    }

    // Fetch previous tasks for context about the SEO project
    if (clientBoardId && task?.id) {
      enrichedContext.previousTasks = await fetchPreviousTasksForClient(
        clientBoardId,
        task.id
      );
    }

    // Call Gemini Haiku to generate the email
    const result = await generateClientEmail(enrichedContext);
    return result;
  } catch (err) {
    console.error('[generateEmailWithAI] Unexpected error:', err);
    return null;
  }
};

// ============================================
// EMAIL SENDING (calls Supabase Edge Function)
// ============================================

export const sendEmailViaProvider = async (
  partnerId: string,
  to: string,
  subject: string,
  body: string,
  taskId?: string,
  clientBoardId?: string
): Promise<{ success: boolean; error?: string; threadId?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        partnerId,
        to,
        subject,
        body,
        taskId,
        clientBoardId,
      },
    });

    console.log('=== SEND EMAIL RESPONSE ===');
    console.log('Full response data:', data);
    console.log('DB Save result:', data?.dbSave);
    console.log('Response error:', error);
    console.log('=== END RESPONSE ===');

    if (error) {
      // Try to extract error from context (Edge Function response body)
      let errorMsg = error.message;
      try {
        if (error.context && typeof error.context === 'object') {
          const ctx = error.context as any;
          if (ctx.error) errorMsg = ctx.error;
          if (ctx.body) {
            const bodyData = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
            if (bodyData.error) errorMsg = bodyData.error;
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
      console.error('[sendEmailViaProvider] Error:', errorMsg);
      return { success: false, error: errorMsg };
    }

    // Check for error in response data
    if (data && !data.success) {
      console.error('[sendEmailViaProvider] API Error:', data.error);
      return { success: false, error: data.error || 'Failed to send email' };
    }

    return { success: true, threadId: data?.threadId };
  } catch (err: any) {
    console.error('[sendEmailViaProvider] Unexpected error:', err);
    return { success: false, error: err.message || 'Unknown error' };
  }
};

// ============================================
// EMAIL THREAD / REPLIES
// ============================================

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  isFromPartner: boolean;
}

export const fetchEmailThread = async (
  partnerId: string,
  taskId: string
): Promise<{ success: boolean; messages: EmailMessage[]; hasThread: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-email-thread', {
      body: { partnerId, taskId },
    });

    if (error) {
      console.error('[fetchEmailThread] Error:', error.message);
      return { success: false, messages: [], hasThread: false, error: error.message };
    }

    if (data && !data.success) {
      return { success: false, messages: [], hasThread: false, error: data.error };
    }

    return {
      success: true,
      messages: data?.messages || [],
      hasThread: data?.hasThread || false,
    };
  } catch (err: any) {
    console.error('[fetchEmailThread] Unexpected error:', err);
    return { success: false, messages: [], hasThread: false, error: err.message };
  }
};
