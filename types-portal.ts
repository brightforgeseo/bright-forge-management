// Client Portal Types
// Separate from main app types for partner-facing portal

import { ClientBoard, Task, TaskGroup, ToastType } from './types';

// ============================================
// PORTAL VIEWS & NAVIGATION
// ============================================

export enum PortalView {
  DASHBOARD = 'DASHBOARD',
  TASKS = 'TASKS',
  CHAT = 'CHAT',
  SETTINGS = 'SETTINGS',
}

// ============================================
// PARTNER ACCOUNT
// ============================================

export interface PartnerAccount {
  id: string;
  email: string;
  company_name: string;
  full_name: string;
  avatar_url?: string;
  email_provider?: 'gmail' | 'outlook' | null;
  email_address?: string; // Connected email for sending
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

// ============================================
// PARTNER CLIENT ACCESS
// ============================================

export interface PartnerClientAccess {
  id: string;
  partner_id: string;
  client_board_id: string;
  granted_by?: string;
  granted_at: string;
}

// Extended client board with partner-specific info
export interface PartnerClientBoard extends ClientBoard {
  taskCount: number;
  completedCount: number;
  pendingEmailCount: number;
}

// ============================================
// PARTNER TASKS
// ============================================

export type PartnerTaskStatus =
  | 'assigned'
  | 'in_progress'
  | 'needs_content'
  | 'send_email'
  | 'email_sent'
  | 'completed';

export interface PartnerTask {
  id: string;
  partner_id: string;
  client_board_id: string;
  task_id: string;
  group_id: string;
  visible_notes?: string;
  partner_status: PartnerTaskStatus;
  assigned_at: string;
  assigned_by?: string;
  completed_at?: string;
  // Joined data from client_boards
  task?: Task;
  client_name?: string;
  group_title?: string;
}

// For kanban board columns
export interface PartnerTaskColumn {
  id: PartnerTaskStatus;
  title: string;
  color: string;
  tasks: PartnerTask[];
}

// ============================================
// PARTNER MESSAGES (1:1 with Ben)
// ============================================

export interface PartnerMessage {
  id: string;
  partner_id: string;
  sender_type: 'partner' | 'team';
  sender_id?: string;
  sender_name: string;
  text: string;
  is_read: boolean;
  attachment_url?: string;
  attachment_type?: 'image' | 'file';
  attachment_name?: string;
  created_at: string;
}

// ============================================
// PARTNER EMAILS
// ============================================

export type EmailStatus = 'draft' | 'ready' | 'sent' | 'failed';

export interface PartnerEmail {
  id: string;
  partner_id: string;
  task_id?: string;
  client_email: string;
  client_name?: string;
  subject: string;
  body: string;
  status: EmailStatus;
  ai_generated: boolean;
  error_message?: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// EMAIL GENERATION
// ============================================

export interface TaskComment {
  author: string;
  text: string;
  createdAt: string;
}

export interface PreviousTaskSummary {
  title: string;
  status: string;
  completedAt?: string;
}

export interface EmailGenerationContext {
  // Current task info
  taskTitle: string;
  taskDescription?: string;
  taskStatus?: string;
  taskDueDate?: string;

  // Task comments from both portals
  taskComments?: TaskComment[];
  partnerComments?: TaskComment[];

  // Client info
  clientName: string;
  clientIndustry?: string;

  // Previous tasks for context about the SEO project
  previousTasks?: PreviousTaskSummary[];

  // Notes visible to partner
  notes: string;

  // Partner info
  partnerName: string;
  partnerCompany: string;
  partnerFullName: string;

  // Reply context (for generating responses to client emails)
  isReply?: boolean;
  previousConversation?: string;
  lastClientMessage?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

// ============================================
// EMAIL OAUTH
// ============================================

export interface EmailCredentials {
  provider: 'gmail' | 'outlook';
  access_token: string;
  refresh_token: string;
  expires_at: string;
  email_address: string;
}

// ============================================
// COMPONENT PROPS
// ============================================

export interface PortalComponentProps {
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
}

export interface ClientPortalLayoutProps extends PortalComponentProps {
  currentView: PortalView;
  onChangeView: (view: PortalView) => void;
  unreadMessages: number;
  children: React.ReactNode;
}

export interface ClientPortalDashboardProps extends PortalComponentProps {
  onNavigateToTasks: (clientId?: string) => void;
}

export interface ClientPortalTaskBoardProps extends PortalComponentProps {
  selectedClientId?: string;
}

export interface ClientPortalChatProps extends PortalComponentProps {
  onMessagesRead: () => void;
}

export interface ClientPortalSettingsProps extends PortalComponentProps {
  onAccountUpdated: (account: PartnerAccount) => void;
}

export interface EmailGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: PartnerTask;
  partnerAccount: PartnerAccount;
  clientName: string;
  onEmailSent: () => void;
  addToast: (type: ToastType, message: string) => void;
}

export interface EmailConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  partnerAccount: PartnerAccount;
  onConnected: (provider: 'gmail' | 'outlook', email: string) => void;
  addToast: (type: ToastType, message: string) => void;
}

// ============================================
// ADMIN SIDE TYPES
// ============================================

export interface PartnerWithStats extends PartnerAccount {
  clientCount: number;
  taskCount: number;
  unreadMessages: number;
  lastMessageAt?: string;
}

export interface AssignToPartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  groupId: string;
  boardId: string;
  boardName: string;
  onAssigned: () => void;
  addToast: (type: ToastType, message: string) => void;
}

// ============================================
// PORTAL STATS
// ============================================

export interface PortalStats {
  totalClients: number;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  emailsSent: number;
  unreadMessages: number;
}
