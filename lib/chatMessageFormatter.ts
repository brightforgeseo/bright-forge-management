import type { ChatMessage } from '../types';

type AssetUrlNormaliser = (value?: string | null) => string | undefined;
type AvatarProfile = { id: string; avatar_url?: string };

export const resolveChatMessageAvatar = (
  messageAvatar: string | undefined,
  senderId: string | undefined,
  profiles: AvatarProfile[],
): string | undefined => {
  if (messageAvatar && messageAvatar !== 'user') return messageAvatar;
  if (!senderId) return messageAvatar;
  return profiles.find(profile => profile.id === senderId)?.avatar_url || messageAvatar;
};

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
