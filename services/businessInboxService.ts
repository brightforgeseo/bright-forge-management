import { getBridgeUrl } from '../lib/bridgeClient';

const BRIDGE_URL = getBridgeUrl();
const BRIDGE_SECRET = 'brightforge-echo-bridge-2026';

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
  const res = await fetch(`${BRIDGE_URL}/business-inbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BRIDGE_SECRET}`,
    },
    body: JSON.stringify({ userId, ...payload }),
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
