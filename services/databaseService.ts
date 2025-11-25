
import { supabase, supabaseAdmin } from '../lib/supabaseClient';
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

export const deleteNotification = async (notificationId: string) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) console.error('Error deleting notification:', error);
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
  const { data: existing, error: findError } = await supabase
    .from('client_boards')
    .select('id')
    .filter('board_data->>id', 'eq', board.id)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    console.error('Error finding board to save:', findError);
    return;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('client_boards')
      .update({ board_data: board, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Error updating board:', updateError);
    } else {
      console.log('Board saved successfully:', board.id, board.name);
    }
  } else {
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
    editedAt: row.edited_at,
    taskLink: row.task_link,
    callRoomId: row.call_room_id,
    callType: row.call_type
  }));
};

export const sendChatMessage = async (msg: ChatMessage) => {
  const insertData: Record<string, any> = {
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
  boardName: string,
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

  for (const board of boards) {
    const boardData = board.board_data as any;
    if (!boardData.groups) continue;

    for (const group of boardData.groups) {
      if (!group.tasks) continue;

      for (const task of group.tasks) {
        if (!task.dueDate || !task.assignedTo) continue;

        const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];

        // Skip if current user is not assigned (they triggered the check)
        if (!assignedIds.includes(currentUserId)) continue;

        const taskDueDate = new Date(task.dueDate);
        const daysOverdue = Math.floor((now.getTime() - taskDueDate.getTime()) / (1000 * 60 * 60 * 24));

        // Notification 1: Task due today - notify ALL assigned users
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

        // Notification 2: Task overdue for 2+ days with no comments - notify ALL assigned users
        if (daysOverdue >= 2) {
          const hasComments = task.comments && task.comments.length > 0;

          if (!hasComments) {
            for (const userId of assignedIds) {
              const warningMessage = `"${task.title}" is ${daysOverdue} days overdue with no updates on ${boardData.name}`;
              await createNotificationIfNotDuplicate(
                userId,
                'Overdue Task Warning',
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
  // First, check if channel_members table is accessible
  const { error: testError } = await supabase
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .limit(1);

  if (testError) {
    throw new Error(`Cannot access channel_members table: ${testError.message}`);
  }

  // Fetch members with profile data
  const { data, error } = await supabase
    .from('channel_members')
    .select(`
      id,
      channel_id,
      user_id,
      role,
      invited_by,
      joined_at,
      profiles!channel_members_user_id_fkey (
        id,
        full_name,
        avatar_url
      )
    `)
    .eq('channel_id', channelId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new Error(`${error.message} (Code: ${error.code})`);
  }

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
