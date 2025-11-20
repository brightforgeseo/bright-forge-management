
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
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'alert' | 'message';
  linkView?: string;
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
  groups: TaskGroup[];
  statusDefs: LabelDefinition[];
  priorityDefs: LabelDefinition[];
}

export enum ToolView {
  DASHBOARD = 'DASHBOARD',
  KEYWORD_RESEARCH = 'KEYWORD_RESEARCH',
  CONTENT_GENERATOR = 'CONTENT_GENERATOR',
  SITE_AUDIT = 'SITE_AUDIT',
  TASKS = 'TASKS',
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

export interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  assignedTo?: string; // User ID or name of assigned person
}

export interface TaskGroup {
  id: string;
  title: string;
  color: string;
  tasks: Task[];
  isCollapsed?: boolean;
}

export interface ChatMessage {
  id: string;
  channelId?: string;
  sender: string;
  text: string;
  timestamp: string;
  isAi?: boolean;
  avatar?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'file';
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'channel' | 'dm';
  unread?: number;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastNotification {
  id: string;
  type: ToastType;
  message: string;
}