import type { ChatMessage } from '../types';

type AssetUrlNormaliser = (value?: string | null) => string | undefined;

export const formatChatRow = (
  row: any,
  normaliseAssetUrl: AssetUrlNormaliser,
): ChatMessage => ({
  id: row.id,
  channelId: row.channel_id,
  sender: row.sender,
  senderId: row.sender_id,
  text: row.text,
  timestamp: row.created_at,
  isAi: row.is_ai,
  avatar: normaliseAssetUrl(row.avatar) || row.avatar,
  attachmentUrl: normaliseAssetUrl(row.attachment_url) || row.attachment_url,
  attachmentType: row.attachment_type,
  attachmentName: row.attachment_name,
  isEdited: row.is_edited,
  editedAt: row.edited_at,
  isPinned: row.is_pinned,
  pinnedAt: row.pinned_at,
  pinnedBy: row.pinned_by,
  taskLink: row.task_link,
  callRoomId: row.call_room_id,
  callType: row.call_type,
  parentMessageId: row.parent_message_id,
  replyCount: row.reply_count || 0,
});
