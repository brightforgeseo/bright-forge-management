
export interface BrandingConfig {
  companyName: string;
  primaryColor: string;
  logoUrl?: string;
}

export interface User {
  id: string;
  name: string;
  role: string;
  initials: string;
  email?: string;
  avatarUrl?: string;
}

export interface Profile {
  id: string;
  full_name?: string;
  avatar_url?: string;
  email?: string;
  updated_at?: string;
  isOnline?: boolean; // Presence tracking
  lastSeen?: string; // Last activity timestamp
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'alert' | 'message';
  linkView?: string;
  linkData?: string; // JSON string with task/board IDs
  isRead: boolean;
  createdAt: string;
}

export interface LabelDefinition {
  id: string;
  label: string;
  color: string;
}

export interface ClientBoard {
  id: string;
  name: string;
  initials: string;
  color: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  notes?: string;
  groups: TaskGroup[];
  statusDefs: LabelDefinition[];
  priorityDefs: LabelDefinition[];
  archivedTasks?: ArchivedTask[]; // Soft-deleted tasks that can be restored
}

export enum ToolView {
  DASHBOARD = 'DASHBOARD',
  KEYWORD_RESEARCH = 'KEYWORD_RESEARCH',
  CONTENT_GENERATOR = 'CONTENT_GENERATOR',
  SITE_AUDIT = 'SITE_AUDIT',
  QA_CHECKER = 'QA_CHECKER',
  TASKS = 'TASKS',
  MY_WORK = 'MY_WORK',
  TEAM_CHAT = 'TEAM_CHAT',
  SETTINGS = 'SETTINGS',
}

export interface KeywordResult {
  keyword: string;
  searchVolume: number;
  difficulty: string;
  competition: number;
  trend: number[];
}

export interface AuditResult {
  score: number;
  issues: {
    severity: 'high' | 'medium' | 'low';
    message: string;
    recommendation: string;
  }[];
  summary: string;
}

export interface ContentResult {
  title: string;
  content: string;
  metaDescription: string;
}

export interface QACorrection {
  find: string;
  replace: string;
}

export interface TaskComment {
  id: string;
  author: string;
  authorId?: string; // Profile ID of comment author
  text: string;
  timestamp: string;
  avatar?: string;
  mentions?: string[]; // Array of profile IDs mentioned in comment
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate: string;
  assignedTo?: string | string[]; // User ID(s) - single UUID or array of UUIDs
  worksheet?: string; // URL to worksheet
  clientSheet?: string; // URL to client sheet
  comments?: TaskComment[];
}

export interface ArchivedTask extends Task {
  archivedAt: string; // ISO timestamp when task was archived
  originalGroupId: string; // Group the task was in before archiving
  originalGroupTitle: string; // Title of the original group
}

export interface TaskGroup {
  id: string;
  title: string;
  color: string;
  tasks: Task[];
  isCollapsed?: boolean;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[]; // Array of user IDs who reacted with this emoji
  count: number;
}

export interface ChatMessage {
  id: string;
  channelId?: string;
  sender: string;
  senderId?: string; // User ID of sender for edit permissions
  text: string;
  timestamp: string;
  isAi?: boolean;
  avatar?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'file';
  attachmentName?: string;
  isEdited?: boolean; // Flag to show message was edited
  editedAt?: string; // Timestamp of last edit
  reactions?: MessageReaction[]; // Emoji reactions on this message
  isPinned?: boolean; // Whether this message is pinned
  pinnedAt?: string; // When the message was pinned
  pinnedBy?: string; // Who pinned the message
  // Call room ID for voice/video calls
  callRoomId?: string;
  callType?: 'video' | 'voice';
  // Task link fields for shared tasks
  taskLink?: {
    taskId: string;
    groupId: string;
    boardId: string;
    boardName: string;
    groupTitle: string;
    title: string;
    status: string;
    statusColor: string;
    priority: string;
    priorityColor: string;
    dueDate: string;
    assignedTo?: string[];
  };
  // Threading/Reply fields
  parentMessageId?: string; // ID of parent message being replied to
  replyCount?: number; // Number of replies to this message
  parentMessage?: { id: string; sender: string; text: string }; // Preview of parent for inline display
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'channel' | 'dm';
  is_private?: boolean;
  owner_id?: string;
  unread?: number;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'owner' | 'member';
  invited_by?: string;
  joined_at: string;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastNotification {
  id: string;
  type: ToastType;
  message: string;
}