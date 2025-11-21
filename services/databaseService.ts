
import { supabase } from '../lib/supabaseClient';
import { ClientBoard, ChatMessage, ChatChannel, Profile, AppNotification } from '../types';

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


// --- Profiles ---

export const fetchProfiles = async (): Promise<Profile[]> => {
    const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

    return (data as Profile[]) || [];
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
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching channels:', error);
    return [];
  }
  return data as ChatChannel[];
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

  if (error) throw error;

  // If private channel with owner, add owner as member
  if (isPrivate && ownerId && data) {
    await addChannelMember(data.id, ownerId, 'owner');
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

  return data.map((row: any) => ({
    ...row.board_data,
    db_id: row.id
  }));
};

export const saveClientBoard = async (board: ClientBoard) => {
  const { data: existing } = await supabase
    .from('client_boards')
    .select('id')
    .filter('board_data->>id', 'eq', board.id)
    .single();

  if (existing) {
    await supabase
      .from('client_boards')
      .update({ board_data: board, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('client_boards').insert({ board_data: board });
  }
};

export const deleteClientBoard = async (boardId: string) => {
  await supabase
    .from('client_boards')
    .delete()
    .filter('board_data->>id', 'eq', boardId);
};

// --- Chat ---

export const fetchChatMessages = async (channelId: string): Promise<ChatMessage[]> => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true });
    // No limit - load ALL messages

  if (error) {
    console.error('Error fetching messages:', error);
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
    isEdited: row.is_edited,
    editedAt: row.edited_at
  }));
};

export const sendChatMessage = async (msg: ChatMessage) => {
  console.log('[sendChatMessage] Starting with message:', msg);

  const insertData = {
    channel_id: msg.channelId,
    sender: msg.sender,
    sender_id: msg.senderId,
    text: msg.text,
    is_ai: msg.isAi || false,
    avatar: msg.avatar,
    created_at: msg.timestamp,
    attachment_url: msg.attachmentUrl,
    attachment_type: msg.attachmentType
  };

  console.log('[sendChatMessage] Insert data:', insertData);

  const { data, error } = await supabase
    .from('chat_messages')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[sendChatMessage] Database error:', error);
    console.error('[sendChatMessage] Error code:', error.code);
    console.error('[sendChatMessage] Error message:', error.message);
    console.error('[sendChatMessage] Error details:', error.details);
    console.error('[sendChatMessage] Error hint:', error.hint);
    throw error;
  }

  console.log('[sendChatMessage] Success! Inserted data:', data);
  return data;
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

// --- Storage ---

export const uploadFile = async (file: File, bucket: string = 'uploads'): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

    console.log(`[Upload] Uploading to bucket: ${bucket}, file: ${fileName}`);
    const { data: uploadData, error } = await supabase.storage.from(bucket).upload(fileName, file);

    if (error) {
      console.error(`[Upload] Error uploading file:`, error);
      return null;
    }

    console.log(`[Upload] Upload successful:`, uploadData);
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    console.log(`[Upload] Public URL:`, data.publicUrl);
    return data.publicUrl;
  } catch (e) {
    console.error(`[Upload] Unexpected error:`, e);
    return null;
  }
};

// --- Due Date Notifications ---

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

  for (const board of boards) {
    const boardData = board.board_data as any;
    if (!boardData.groups) continue;

    for (const group of boardData.groups) {
      if (!group.tasks) continue;

      for (const task of group.tasks) {
        if (task.dueDate === today && task.assignedTo) {
          const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];

          if (!assignedIds.includes(currentUserId)) continue;

          // Check for duplicate notification - check both by link_data AND by message text
          const taskMessage = `"${task.title}" is due today on ${boardData.name}`;
          const { data: existing } = await supabase
            .from('notifications')
            .select('id, link_data, message')
            .eq('user_id', currentUserId)
            .eq('type', 'alert')
            .eq('title', 'Task Due Today')
            .gte('created_at', today + 'T00:00:00');

          // Check if this exact task notification already exists
          const isDuplicate = existing?.some(notif => {
            // Check by message text (always works)
            if (notif.message === taskMessage) return true;
            // Check by link_data if it exists
            if (notif.link_data) {
              const linkData = typeof notif.link_data === 'string'
                ? JSON.parse(notif.link_data)
                : notif.link_data;
              return linkData.taskId === task.id && linkData.boardId === boardData.id;
            }
            return false;
          });

          if (isDuplicate) continue;

          await createNotification(
            currentUserId,
            'Task Due Today',
            `"${task.title}" is due today on ${boardData.name}`,
            'alert',
            'TASKS',
            {
              taskId: task.id,
              boardId: boardData.id,
              groupId: group.id
            }
          );
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
  const { data, error } = await supabase
    .from('channel_members')
    .select(`
      *,
      user:profiles!channel_members_user_id_fkey(id, full_name, email, avatar_url)
    `)
    .eq('channel_id', channelId)
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return data;
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
