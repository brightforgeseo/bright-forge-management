import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatChatRow } from '../lib/chatMessageFormatter.ts';

test('chat rows normalise attachment and avatar URLs before rendering', () => {
  const row = {
    id: 'message-1',
    channel_id: 'channel-1',
    sender: 'Ben',
    sender_id: 'user-1',
    text: 'Sent an image',
    created_at: '2026-07-16T00:00:00Z',
    is_ai: false,
    avatar: '/supabase/storage/v1/object/public/uploads/avatar.png',
    attachment_url: '/supabase/storage/v1/object/public/uploads/photo.png',
    attachment_type: 'image',
  };
  const normalise = (value?: string | null) => value ? `https://portal.test${value}` : undefined;

  const result = formatChatRow(row, normalise);

  assert.equal(result.avatar, 'https://portal.test/supabase/storage/v1/object/public/uploads/avatar.png');
  assert.equal(result.attachmentUrl, 'https://portal.test/supabase/storage/v1/object/public/uploads/photo.png');
});
