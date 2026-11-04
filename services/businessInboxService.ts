import { supabase } from '../lib/supabaseClient';

const PORTAL_ORIGIN = typeof window !== 'undefined' && window.location.protocol.startsWith('http') && !window.location.hostname.endsWith('vercel.app')
  ? window.location.origin
  : 'https://echo-ben.tailfdbc33.ts.net';

export interface BusinessInboxAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface BusinessInboxMessage {
  id: string;
  folder: string;
  uid: string;
  messageId: string;
  date: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  body: string;
  attachments: BusinessInboxAttachment[];
  hasAttachments: boolean;
}

export interface BusinessInboxResponse {
  ok: boolean;
  account: string;
  folder: string;
  count: number;
  syncedAt: string;
  messages: BusinessInboxMessage[];
}

export interface BusinessEmailMessageResponse {
  ok: boolean;
  account: string;
  folder: string;
  syncedAt: string;
  message: BusinessInboxMessage;
}

export interface SendBusinessEmailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

export type BusinessEmailAction = 'mark-read' | 'mark-unread' | 'archive' | 'delete';

async function postBusinessInbox<T>(userId: string, payload: Record<string, any>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in again before opening Business Inbox');
  const res = await fetch(`${PORTAL_ORIGIN}/api/business-inbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.details || data?.error || `Inbox request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchBusinessInbox(userId: string, limit = 20, folder = 'INBOX'): Promise<BusinessInboxResponse> {
  return postBusinessInbox<BusinessInboxResponse>(userId, { mode: 'list', limit, folder, includeBody: false });
}

export async function fetchBusinessEmailMessage(userId: string, folder: string, uid: string): Promise<BusinessEmailMessageResponse> {
  return postBusinessInbox<BusinessEmailMessageResponse>(userId, { mode: 'message', folder, uid });
}

export async function sendBusinessEmail(userId: string, payload: SendBusinessEmailPayload): Promise<{ ok: boolean; sentAt: string; messageId: string }> {
  return postBusinessInbox(userId, { mode: 'send', ...payload });
}

export async function runBusinessEmailAction(userId: string, folder: string, uid: string, action: BusinessEmailAction): Promise<{ ok: boolean; action: BusinessEmailAction; updatedAt: string }> {
  return postBusinessInbox(userId, { mode: 'action', folder, uid, action });
}
