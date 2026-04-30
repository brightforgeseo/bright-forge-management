
import { supabase, supabaseAdmin } from '../lib/supabaseClient';
import { ClientBoard, ChatMessage, ChatChannel, Profile, AppNotification } from '../types';

// --- Profile Management ---

export const ensureProfileExists = async (userId: string, email?: string, fullName?: string) => {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (existing) return true;

  // Try to get name from allowed_users if not provided
  let name = fullName;
  if (!name && email) {
    const { data: allowedUser } = await supabase
      .from('allowed_users')
      .select('full_name')
      .eq('email', email.toLowerCase())
      .single();
    if (allowedUser?.full_name) {
      name = allowedUser.full_name;
    }
  }

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name: name || email?.split('@')[0] || 'User'
    }, { onConflict: 'id' });

  if (error) {
    console.error('[ensureProfileExists] Error creating profile:', error.message);
    return false;
  }

  return true;
};

// --- Allowlist (Invites) ---

export const addToAllowlist = async (email: string, fullName: string, password?: string) => {
  const { error } = await supabase
    .from('allowed_users')
    .insert({ 
        email: email.toLowerCase(), 
        role: 'Team Member',
        full_name: fullName,
        temp_password: password // Store temp password for "Smart Login"
    });
  
  if (error) throw error;
};

export const verifyPreProvisionedUser = async (email: string, passwordInput: string) => {
    // Check if this user exists in allowlist with this password
    const { data } = await supabase
        .from('allowed_users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();
    
    if (data && data.temp_password === passwordInput) {
        return { name: data.full_name };
    }
    return null;
};

export const consumePreProvisionedUser = async (email: string) => {
    // Clear temp password so it can't be used again
    await supabase
        .from('allowed_users')
        .update({ temp_password: null }) 
        .eq('email', email.toLowerCase());
};

export const checkAllowlist = async (email: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('allowed_users')
    .select('email')
    .eq('email', email.toLowerCase())
    .single();
  
  if (error || !data) return false;
  return true;
};

// --- Notifications ---

export const fetchNotifications = async (userId: string): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }

  return data.map((n: any) => ({
    id: n.id,
    userId: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type,
    linkView: n.link_view,
    linkData: n.link_data,
    isRead: n.is_read,
    createdAt: n.created_at
  }));
};

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'alert' | 'message',
  linkView?: string,
  linkData?: any
) => {
  // Prevent duplicate notifications within 30 seconds for the same task/channel
  // This prevents spam when multiple components trigger notifications
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();

  if (linkData?.taskId || linkData?.channelId) {
    const { data: recent } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', thirtySecondsAgo)
      .limit(10);

    if (recent && recent.length > 0) {
      // Check for duplicate by querying with the same linkData
      const { data: existing } = await supabase
        .from('notifications')
        .select('id, link_data')
        .eq('user_id', userId)
        .gte('created_at', thirtySecondsAgo);

      const isDuplicate = existing?.some(n => {
        if (!n.link_data) return false;
        const existingData = typeof n.link_data === 'string' ? JSON.parse(n.link_data) : n.link_data;
        // Same task = duplicate
        if (linkData.taskId && existingData.taskId === linkData.taskId) return true;
        // Same DM channel = duplicate (within 30s)
        if (linkData.channelId && linkData.channelType === 'dm' && existingData.channelId === linkData.channelId) return true;
        return false;
      });

      if (isDuplicate) {
        console.log('[Notification] Skipping duplicate notification for user:', userId);
        return null;
      }
    }
  }

  const { data, error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    link_view: linkView,
    link_data: linkData || null
  }).select().single();

  if (error) {
    console.error('Error creating notification:', error);
    throw error;
  }

  return data;
};

export const markNotificationRead = async (id: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);

  if (error) console.error('Error marking notification as read:', error);
};

export const markAllNotificationsRead = async (userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) console.error('Error marking all notifications as read:', error);
};

export const deleteAllNotifications = async (userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId);

  if (error) console.error('Error deleting notifications:', error);
};

export const deleteNotification = async (notificationId: string) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) console.error('Error deleting notification:', error);
};

// Notify a list of recipients in parallel, skipping the sender and de-duplicating IDs.
// Errors on individual recipients are swallowed so one bad insert can't block the rest.
export const notifyUsers = async (
  recipientIds: (string | null | undefined)[],
  excludeUserId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'alert' | 'message',
  linkView?: string,
  linkData?: any
) => {
  const unique = Array.from(new Set(
    recipientIds.filter((id): id is string => !!id && id !== excludeUserId)
  ));
  await Promise.all(unique.map(async (uid) => {
    try {
      await createNotification(uid, title, message, type, linkView, linkData);
    } catch (e) {
      console.error('[notifyUsers] Failed to notify', uid, e);
    }
  }));
};


// --- Profiles ---

export const fetchProfiles = async (): Promise<Profile[]> => {
    // Get profiles from profiles table (only users who have logged in have profiles)
    const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

    return (profiles as Profile[]) || [];
};

export const updateUserProfile = async (fullName: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id);
    await supabase.auth.updateUser({ data: { full_name: fullName } });
  }
};

// --- Channels & DMs ---

export const fetchChannels = async (): Promise<ChatChannel[]> => {
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('No authenticated user');
    return [];
  }

  // Fetch all channels
  const { data: allChannels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .order('created_at', { ascending: true });

  if (channelsError) {
    console.error('Error fetching channels:', channelsError);
    return [];
  }

  // Fetch user's channel memberships
  const { data: memberships, error: membershipsError } = await supabase
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', user.id);

  if (membershipsError) {
    console.error('Error fetching channel memberships:', membershipsError);
    return allChannels?.filter(ch => !ch.is_private) || [];
  }

  // Get set of channel IDs user is a member of
  const memberChannelIds = new Set(memberships?.map(m => m.channel_id) || []);

  // Filter channels: show all public channels + private channels user is a member of
  const filteredChannels = allChannels?.filter(channel => {
    if (!channel.is_private) {
      return true; // Show all public channels
    }
    return memberChannelIds.has(channel.id); // Only show private channels user is a member of
  }) || [];

  return filteredChannels as ChatChannel[];
};

export const createChannel = async (
  name: string,
  type: 'channel' | 'dm' = 'channel',
  isPrivate: boolean = false,
  ownerId?: string
) => {
  // Ensure name is safe
  const safeName = name.toLowerCase().replace(/\s+/g, '-');

  const { data, error } = await supabase
    .from('channels')
    .insert({
      name: safeName,
      type,
      is_private: isPrivate,
      owner_id: ownerId
    })
    .select()
    .single();

  if (error) {
    console.error('Create channel error:', error);
    throw error;
  }

  // If private channel with owner, add owner as member
  if (isPrivate && ownerId && data) {
    try {
      await addChannelMember(data.id, ownerId, 'owner');
    } catch (memberError) {
      console.error('Failed to add owner as member:', memberError);
      // Don't throw - channel was created successfully
    }
  }

  return data;
};

export const getOrCreateDMChannel = async (user1Id: string, user2Id: string) => {
    // Sort IDs to ensure consistent channel naming regardless of who starts chat
    const [id1, id2] = [user1Id, user2Id].sort();
    const channelName = `dm_${id1}_${id2}`;

    // 1. Try to find existing
    const { data: existing } = await supabase
        .from('channels')
        .select('*')
        .eq('name', channelName)
        .single();
    
    if (existing) return existing as ChatChannel;

    // 2. If not, try to create it
    // Handle race condition: if it was created between step 1 and 2 by the other user,
    // insert will fail. We catch that and return the now-existing channel.
    try {
        return await createChannel(channelName, 'dm');
    } catch (e) {
        // Conflict or error? Try fetching one more time
        const { data: retry } = await supabase
            .from('channels')
            .select('*')
            .eq('name', channelName)
            .single();
        if (retry) return retry as ChatChannel;
        throw e;
    }
};

export const deleteChannel = async (id: string) => {
  const { error } = await supabase.from('channels').delete().eq('id', id);
  if (error) throw error;
};

// --- Client Boards ---

export const fetchClientBoards = async (): Promise<ClientBoard[]> => {
  const { data, error } = await supabase
    .from('client_boards')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching boards:', error);
    return [];
  }

  // Deduplicate by board_data.id - keep only the first occurrence (oldest by created_at)
  const seen = new Set<string>();
  const uniqueBoards: ClientBoard[] = [];

  for (const row of data) {
    const boardId = row.board_data?.id;
    if (boardId && !seen.has(boardId)) {
      seen.add(boardId);
      uniqueBoards.push({
        ...row.board_data,
        db_id: row.id
      });
    }
  }

  return uniqueBoards;
};

export const saveClientBoard = async (board: ClientBoard) => {
  // Use db_id if available (set when board was loaded from database)
  const dbId = (board as any).db_id;

  if (dbId) {
    // Update existing board using the database row ID
    const { error: updateError } = await supabase
      .from('client_boards')
      .update({ board_data: board, updated_at: new Date().toISOString() })
      .eq('id', dbId);

    if (updateError) {
      console.error('Error updating board:', updateError);
    } else {
      console.log('Board updated successfully:', board.id, board.name);
    }
  } else {
    // New board - insert it
    const { error: insertError } = await supabase
      .from('client_boards')
      .insert({ board_data: board });

    if (insertError) {
      console.error('Error inserting board:', insertError);
    } else {
      console.log('Board inserted successfully:', board.id, board.name);
    }
  }
};

export const deleteClientBoard = async (boardId: string) => {
  await supabase
    .from('client_boards')
    .delete()
    .filter('board_data->>id', 'eq', boardId);
};

// --- Chat ---

// Default limit for message pagination - load last 100 messages initially
const MESSAGE_PAGE_SIZE = 100;

export const fetchChatMessages = async (
  channelId: string,
  limit: number = MESSAGE_PAGE_SIZE,
  beforeTimestamp?: string
): Promise<ChatMessage[]> => {
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .is('parent_message_id', null) // Only fetch top-level messages (not thread replies)
    .order('created_at', { ascending: false }) // Get newest first for pagination
    .limit(limit);

  // If loading older messages, get messages before the given timestamp
  if (beforeTimestamp) {
    query = query.lt('created_at', beforeTimestamp);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }

  // Reverse to show oldest first in the UI
  return data.reverse().map((row: any) => ({
    id: row.id,
    channelId: row.channel_id,
    sender: row.sender,
    senderId: row.sender_id,
    text: row.text,
    timestamp: row.created_at,
    isAi: row.is_ai,
    avatar: row.avatar,
    attachmentUrl: row.attachment_url,
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
    replyCount: row.reply_count || 0
  }));
};

export const sendChatMessage = async (msg: ChatMessage) => {
  // Ensure sender profile exists before inserting message (fixes FK constraint error)
  if (msg.senderId) {
    await ensureProfileExists(msg.senderId, undefined, msg.sender);
  }

  const insertData: Record<string, any> = {
    channel_id: msg.channelId,
    sender: msg.sender,
    sender_id: msg.senderId,
    text: msg.text,
    is_ai: msg.isAi || false,
    avatar: msg.avatar,
    created_at: msg.timestamp,
    attachment_url: msg.attachmentUrl,
    attachment_type: msg.attachmentType,
    attachment_name: msg.attachmentName
  };

  // Include task link data if present (stored as JSON in text or a separate column)
  if (msg.taskLink) {
    insertData.task_link = msg.taskLink;
  }

  // Include call room data if present
  if (msg.callRoomId) {
    insertData.call_room_id = msg.callRoomId;
    insertData.call_type = msg.callType;
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[sendChatMessage] Error:', error.message);
    throw error;
  }

  return data;
};

// --- Message Threading/Replies ---

export const sendReplyMessage = async (msg: ChatMessage, parentMessageId: string) => {
  // Ensure sender profile exists before inserting message
  if (msg.senderId) {
    await ensureProfileExists(msg.senderId, undefined, msg.sender);
  }

  const insertData: Record<string, any> = {
    channel_id: msg.channelId,
    sender: msg.sender,
    sender_id: msg.senderId,
    text: msg.text,
    is_ai: msg.isAi || false,
    avatar: msg.avatar,
    created_at: msg.timestamp,
    attachment_url: msg.attachmentUrl,
    attachment_type: msg.attachmentType,
    attachment_name: msg.attachmentName,
    parent_message_id: parentMessageId
  };

  // Include task link data if present
  if (msg.taskLink) {
    insertData.task_link = msg.taskLink;
  }

  // Start a transaction: insert message and increment parent's reply_count
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[sendReplyMessage] Error inserting reply:', error.message);
    throw error;
  }

  // Increment parent message's reply_count
  const { error: updateError } = await supabase.rpc('increment_reply_count', {
    message_id: parentMessageId
  });

  // If RPC doesn't exist, fall back to manual update
  if (updateError) {
    console.log('[sendReplyMessage] RPC not available, using manual update');
    // Get current count and update
    const { data: parentMsg } = await supabase
      .from('chat_messages')
      .select('reply_count')
      .eq('id', parentMessageId)
      .single();

    const currentCount = parentMsg?.reply_count || 0;
    await supabase
      .from('chat_messages')
      .update({ reply_count: currentCount + 1 })
      .eq('id', parentMessageId);
  }

  return data;
};

export const fetchThreadReplies = async (parentMessageId: string): Promise<ChatMessage[]> => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('parent_message_id', parentMessageId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[fetchThreadReplies] Error:', error.message);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    channelId: row.channel_id,
    sender: row.sender,
    senderId: row.sender_id,
    text: row.text,
    timestamp: row.created_at,
    isAi: row.is_ai,
    avatar: row.avatar,
    attachmentUrl: row.attachment_url,
    attachmentType: row.attachment_type,
    attachmentName: row.attachment_name,
    isEdited: row.is_edited,
    editedAt: row.edited_at,
    isPinned: row.is_pinned,
    pinnedAt: row.pinned_at,
    pinnedBy: row.pinned_by,
    taskLink: row.task_link,
    parentMessageId: row.parent_message_id,
    replyCount: row.reply_count
  }));
};

export const editChatMessage = async (messageId: string, newText: string) => {
  const { error } = await supabase
    .from('chat_messages')
    .update({
      text: newText,
      is_edited: true,
      edited_at: new Date().toISOString()
    })
    .eq('id', messageId);

  if (error) {
    console.error('Error editing message:', error);
    throw error;
  }
};

export const clearChatHistory = async (channelId: string) => {
    await supabase.from('chat_messages').delete().eq('channel_id', channelId);
}

export const deleteChatMessage = async (messageId: string) => {
  const { data, error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', messageId)
    .select();

  if (error) {
    console.error('[deleteChatMessage] Error:', error.message);
    throw error;
  }

  return data;
}

// --- Message Pinning ---

export const pinMessage = async (messageId: string, userId: string) => {
  const { data, error } = await supabase
    .from('chat_messages')
    .update({
      is_pinned: true,
      pinned_at: new Date().toISOString(),
      pinned_by: userId
    })
    .eq('id', messageId)
    .select();

  if (error) {
    console.error('[pinMessage] Error:', error.message);
    throw error;
  }

  return data?.[0];
};

export const unpinMessage = async (messageId: string) => {
  const { data, error } = await supabase
    .from('chat_messages')
    .update({
      is_pinned: false,
      pinned_at: null,
      pinned_by: null
    })
    .eq('id', messageId)
    .select();

  if (error) {
    console.error('[unpinMessage] Error:', error.message);
    throw error;
  }

  return data?.[0];
};

export const fetchPinnedMessages = async (channelId: string): Promise<ChatMessage[]> => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .eq('is_pinned', true)
    .order('pinned_at', { ascending: false });

  if (error) {
    console.error('[fetchPinnedMessages] Error:', error.message);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    channelId: row.channel_id,
    sender: row.sender,
    senderId: row.sender_id,
    text: row.text,
    timestamp: row.created_at,
    isAi: row.is_ai,
    avatar: row.avatar,
    attachmentUrl: row.attachment_url,
    attachmentType: row.attachment_type,
    attachmentName: row.attachment_name,
    isEdited: row.is_edited,
    editedAt: row.edited_at,
    isPinned: row.is_pinned,
    pinnedAt: row.pinned_at,
    pinnedBy: row.pinned_by,
    taskLink: row.task_link
  }));
};

// --- Message Reactions ---

export const fetchMessageReactions = async (messageId: string) => {
  // Skip fetching reactions for non-UUID message IDs (old timestamp-based IDs)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(messageId)) {
    return [];
  }

  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .eq('message_id', messageId);

  if (error) {
    console.error('Error fetching reactions:', error);
    return [];
  }

  // Group reactions by emoji
  const reactionMap = new Map<string, { emoji: string; userIds: string[]; count: number }>();

  data.forEach((reaction: any) => {
    const existing = reactionMap.get(reaction.emoji);
    if (existing) {
      existing.userIds.push(reaction.user_id);
      existing.count++;
    } else {
      reactionMap.set(reaction.emoji, {
        emoji: reaction.emoji,
        userIds: [reaction.user_id],
        count: 1
      });
    }
  });

  return Array.from(reactionMap.values());
};

export const addMessageReaction = async (messageId: string, userId: string, emoji: string) => {
  const { error } = await supabase
    .from('message_reactions')
    .insert({
      message_id: messageId,
      user_id: userId,
      emoji
    });

  if (error) {
    console.error('Error adding reaction:', error);
    throw error;
  }
};

export const removeMessageReaction = async (messageId: string, userId: string, emoji: string) => {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);

  if (error) {
    console.error('Error removing reaction:', error);
    throw error;
  }
};

// --- Message Search ---

export interface SearchResult {
  message: ChatMessage;
  channelId: string;
  channelName: string;
  channelType: 'channel' | 'dm';
}

export const searchChatMessages = async (
  query: string,
  options?: {
    channelId?: string;
    limit?: number;
  }
): Promise<SearchResult[]> => {
  if (!query.trim()) return [];

  const limit = options?.limit || 50;
  const searchTerm = `%${query.trim()}%`;

  let messagesQuery = supabase
    .from('chat_messages')
    .select('*')
    .ilike('text', searchTerm)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options?.channelId) {
    messagesQuery = messagesQuery.eq('channel_id', options.channelId);
  }

  const { data: messages, error: messagesError } = await messagesQuery;

  if (messagesError) {
    console.error('Error searching messages:', messagesError);
    return [];
  }

  if (!messages || messages.length === 0) return [];

  // Fetch channel info for all unique channel IDs
  const channelIds = [...new Set(messages.map(m => m.channel_id))];
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, type')
    .in('id', channelIds);

  const channelMap = new Map(channels?.map(c => [c.id, c]) || []);

  return messages.map((row: any) => {
    const channel = channelMap.get(row.channel_id);
    return {
      message: {
        id: row.id,
        channelId: row.channel_id,
        sender: row.sender,
        senderId: row.sender_id,
        text: row.text,
        timestamp: row.created_at,
        isAi: row.is_ai,
        avatar: row.avatar,
        attachmentUrl: row.attachment_url,
        attachmentType: row.attachment_type,
        attachmentName: row.attachment_name,
        isEdited: row.is_edited,
        editedAt: row.edited_at,
        taskLink: row.task_link,
        callRoomId: row.call_room_id,
        callType: row.call_type
      },
      channelId: row.channel_id,
      channelName: channel?.name || 'Unknown',
      channelType: channel?.type || 'channel'
    };
  });
};

// --- Storage ---

export const uploadFile = async (file: File, bucket: string = 'uploads'): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error } = await supabase.storage.from(bucket).upload(fileName, file);

    if (error) {
      console.error('[Upload] Error:', error.message);
      return null;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) {
    console.error('[Upload] Unexpected error:', e);
    return null;
  }
};

// --- Due Date Notifications ---

// Helper function to create notification for a single user if not duplicate
const createNotificationIfNotDuplicate = async (
  userId: string,
  title: string,
  message: string,
  taskId: string,
  boardId: string,
  groupId: string,
  _boardName: string, // Used in message construction by caller
  today: string
) => {
  const { data: existing } = await supabase
    .from('notifications')
    .select('id, link_data, message')
    .eq('user_id', userId)
    .eq('type', 'alert')
    .eq('title', title)
    .gte('created_at', today + 'T00:00:00');

  const isDuplicate = existing?.some(notif => {
    if (notif.message === message) return true;
    if (notif.link_data) {
      const linkData = typeof notif.link_data === 'string'
        ? JSON.parse(notif.link_data)
        : notif.link_data;
      return linkData.taskId === taskId && linkData.boardId === boardId;
    }
    return false;
  });

  if (!isDuplicate) {
    await createNotification(
      userId,
      title,
      message,
      'alert',
      'TASKS',
      { taskId, boardId, groupId }
    );
  }
};

export const checkDueDateNotifications = async (currentUserId: string) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const { data: boards, error: boardsError } = await supabase
    .from('client_boards')
    .select('*');

  if (boardsError || !boards) {
    console.error('Error fetching boards for due date check:', boardsError);
    return;
  }

  // Status labels that indicate a task is complete/handled - no notifications needed
  // Using partial matching to catch variations like "Done - Approved", "Completed!", etc.
  const completedKeywords = ['done', 'complete', 'finished', 'closed', 'approved', 'shipped', 'delivered', 'resolved', 'sent to client', 'ben to check', 'archived'];
  // Colors that typically indicate completion (green shades)
  const completedColors = ['#00c875', '#00ca72', '#22c55e', '#16a34a', '#15803d', '#166534', '#4ade80', '#86efac', 'green'];

  const isCompletedStatus = (label: string, color?: string): boolean => {
    const lowerLabel = label.toLowerCase();
    // Check if label contains any completion keyword
    if (completedKeywords.some(keyword => lowerLabel.includes(keyword))) return true;
    // Check if color indicates completion (green)
    if (color && completedColors.includes(color.toLowerCase())) return true;
    return false;
  };

  for (const board of boards) {
    const boardData = board.board_data as any;
    if (!boardData.groups) continue;

    // Build a map of status IDs to their label and color
    const statusMap = new Map<string, { label: string; color?: string }>();
    if (boardData.statusDefs) {
      for (const def of boardData.statusDefs) {
        statusMap.set(def.id, { label: def.label?.toLowerCase() || '', color: def.color });
      }
    }

    for (const group of boardData.groups) {
      if (!group.tasks) continue;

      for (const task of group.tasks) {
        if (!task.dueDate || !task.assignedTo) continue;

        // Skip tasks with completed/handled statuses
        const statusInfo = statusMap.get(task.status);
        if (statusInfo && isCompletedStatus(statusInfo.label, statusInfo.color)) continue;

        // Also skip archived tasks
        if (task.archived || task.isArchived) continue;

        const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];

        // Skip if current user is not assigned (they triggered the check)
        if (!assignedIds.includes(currentUserId)) continue;

        const taskDueDate = new Date(task.dueDate);
        taskDueDate.setHours(0, 0, 0, 0);
        const todayDate = new Date(now);
        todayDate.setHours(0, 0, 0, 0);
        const daysOverdue = Math.floor((todayDate.getTime() - taskDueDate.getTime()) / (1000 * 60 * 60 * 24));

        // Notification 1: Task due today - notify assigned users
        if (task.dueDate === today) {
          for (const userId of assignedIds) {
            const taskMessage = `"${task.title}" is due today on ${boardData.name}`;
            await createNotificationIfNotDuplicate(
              userId,
              'Task Due Today',
              taskMessage,
              task.id,
              boardData.id,
              group.id,
              boardData.name,
              today
            );
          }
        }

        // Notification 1b: Projected / upcoming tasks - 3 days and 1 day before due
        // daysOverdue is negative when the task is in the future, so daysUntilDue = -daysOverdue
        const daysUntilDue = -daysOverdue;
        if (daysUntilDue === 3 || daysUntilDue === 1) {
          for (const userId of assignedIds) {
            const dueLabel = daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`;
            const upcomingMessage = `"${task.title}" is due ${dueLabel} on ${boardData.name}`;
            await createNotificationIfNotDuplicate(
              userId,
              'Upcoming Task',
              upcomingMessage,
              task.id,
              boardData.id,
              group.id,
              boardData.name,
              today
            );
          }
        }

        // Notification 2: Overdue tasks - only notify at specific intervals to avoid spam
        // Day 1: First overdue reminder
        // Day 7: One week overdue reminder
        // Day 14+: Every 7 days thereafter
        if (daysOverdue > 0) {
          const shouldNotify = daysOverdue === 1 || daysOverdue === 7 || (daysOverdue >= 14 && daysOverdue % 7 === 0);

          if (shouldNotify) {
            for (const userId of assignedIds) {
              const overdueText = daysOverdue === 1
                ? '1 day overdue'
                : `${daysOverdue} days overdue`;
              const warningMessage = `"${task.title}" is ${overdueText} on ${boardData.name}`;
              await createNotificationIfNotDuplicate(
                userId,
                'Overdue Task',
                warningMessage,
                task.id,
                boardData.id,
                group.id,
                boardData.name,
                today
              );
            }
          }
        }
      }
    }
  }
};

// =====================================================
// CHANNEL MEMBERSHIP FUNCTIONS
// =====================================================

export const addChannelMember = async (
  channelId: string,
  userId: string,
  role: 'owner' | 'member' = 'member',
  invitedBy?: string
) => {
  const { data, error } = await supabase
    .from('channel_members')
    .insert({
      channel_id: channelId,
      user_id: userId,
      role,
      invited_by: invitedBy
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const removeChannelMember = async (channelId: string, userId: string) => {
  const { error } = await supabase
    .from('channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', userId);

  if (error) throw error;
};

export const fetchChannelMembers = async (channelId: string) => {
  // Fetch members
  const { data: members, error } = await supabase
    .from('channel_members')
    .select('id, channel_id, user_id, role, invited_by, joined_at')
    .eq('channel_id', channelId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new Error(`${error.message} (Code: ${error.code})`);
  }

  if (!members || members.length === 0) return [];

  // Fetch profiles separately for each member
  const userIds = members.map(m => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds);

  // Combine members with their profiles
  return members.map(member => ({
    ...member,
    profiles: profiles?.find(p => p.id === member.user_id) || null
  }));
};

export const isChannelMember = async (channelId: string, userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
  return !!data;
};

// =====================================================
// ADMIN USER MANAGEMENT FUNCTIONS
// =====================================================

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  user_metadata: {
    full_name?: string;
  };
}

export const fetchAllAuthUsers = async (): Promise<AuthUser[]> => {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    console.error('Error fetching auth users:', error);
    throw error;
  }

  return data.users.map(user => ({
    id: user.id,
    email: user.email || '',
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at || null,
    user_metadata: user.user_metadata || {}
  }));
};

export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword
  });

  if (error) {
    console.error('Error resetting password:', error);
    throw error;
  }
};

export const deleteAuthUser = async (userId: string): Promise<void> => {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

export const updateUserRole = async (email: string, newRole: string): Promise<void> => {
  const { error } = await supabase
    .from('allowed_users')
    .update({ role: newRole })
    .eq('email', email.toLowerCase());

  if (error) {
    console.error('Error updating user role:', error);
    throw error;
  }
};

// =====================================================
// ACTIVITY LOG FUNCTIONS
// =====================================================

export interface ActivityLogEntry {
  id: string;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  boardId: string | null;
  boardName: string | null;
  groupId: string | null;
  groupName: string | null;
  metadata: any;
  createdAt: string;
}

export const logActivity = async (params: {
  userId?: string;
  userEmail: string;
  userName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  boardId?: string;
  boardName?: string;
  groupId?: string;
  groupName?: string;
  metadata?: any;
}) => {
  const { error } = await supabase.from('activity_log').insert({
    user_id: params.userId || null,
    user_email: params.userEmail,
    user_name: params.userName || null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId || null,
    entity_name: params.entityName || null,
    field_name: params.fieldName || null,
    old_value: params.oldValue || null,
    new_value: params.newValue || null,
    board_id: params.boardId || null,
    board_name: params.boardName || null,
    group_id: params.groupId || null,
    group_name: params.groupName || null,
    metadata: params.metadata || null
  });

  if (error) {
    console.error('Error logging activity:', error);
    // Don't throw - activity logging shouldn't break the app
  }
};

export const fetchActivityLog = async (options?: {
  limit?: number;
  offset?: number;
  entityType?: string;
  action?: string;
  userId?: string;
  boardId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ActivityLogEntry[]> => {
  let query = supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  } else {
    query = query.limit(100); // Default limit
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
  }

  if (options?.entityType) {
    query = query.eq('entity_type', options.entityType);
  }

  if (options?.action) {
    query = query.eq('action', options.action);
  }

  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }

  if (options?.boardId) {
    query = query.eq('board_id', options.boardId);
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching activity log:', error);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    boardId: row.board_id,
    boardName: row.board_name,
    groupId: row.group_id,
    groupName: row.group_name,
    metadata: row.metadata,
    createdAt: row.created_at
  }));
};
