const BRIDGE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BRIDGE_URL) || 'http://localhost:18790';
const BRIDGE_SECRET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_SECRET) || 'brightforge-echo-bridge-2026';

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

export async function fetchBusinessInbox(userId: string, limit = 25): Promise<BusinessInboxResponse> {
  const res = await fetch(`${BRIDGE_URL}/business-inbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BRIDGE_SECRET}`,
    },
    body: JSON.stringify({ userId, limit, folder: 'INBOX', includeBody: true }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.details || data?.error || `Inbox request failed (${res.status})`);
  }
  return data as BusinessInboxResponse;
}
