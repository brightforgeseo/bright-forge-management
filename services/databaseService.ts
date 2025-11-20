
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
    .limit(20);
    
  if (error) return [];
  
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
  console.log('📬 Creating notification:', { userId, title, message, type, linkView, linkData });
  const { data, error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    link_view: linkView,
    link_data: linkData ? JSON.stringify(linkData) : null
  });

  if (error) {
    console.error('❌ Error creating notification:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    console.error('Attempted to insert:', { userId, title, message, type, linkView, linkData });
    throw error;
  }

  console.log('✅ Notification created successfully:', data);
  return data;
};

export const markNotificationRead = async (id: string) => {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
};

export const markAllNotificationsRead = async (userId: string) => {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
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

export const createChannel = async (name: string, type: 'channel' | 'dm' = 'channel') => {
  // Ensure name is safe
  const safeName = name.toLowerCase().replace(/\s+/g, '-');
  
  const { data, error } = await supabase
    .from('channels')
    .insert({ name: safeName, type })
    .select()
    .single();
  
  if (error) throw error;
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
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    channelId: row.channel_id,
    sender: row.sender,
    text: row.text,
    timestamp: row.created_at,
    isAi: row.is_ai,
    avatar: row.avatar,
    attachmentUrl: row.attachment_url,
    attachmentType: row.attachment_type
  }));
};

export const sendChatMessage = async (msg: ChatMessage) => {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      channel_id: msg.channelId,
      sender: msg.sender,
      text: msg.text,
      is_ai: msg.isAi || false,
      avatar: msg.avatar,
      created_at: msg.timestamp,
      attachment_url: msg.attachmentUrl,
      attachment_type: msg.attachmentType
    });

  if (error) console.error('Error sending message:', error);
};

export const clearChatHistory = async (channelId: string) => {
    await supabase.from('chat_messages').delete().eq('channel_id', channelId);
}

// --- Storage ---

export const uploadFile = async (file: File, bucket: string = 'uploads'): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { error } = await supabase.storage.from(bucket).upload(fileName, file);
    if (error) return null;
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
};

// --- Due Date Notifications ---

export const checkDueDateNotifications = async (currentUserId: string) => {
  try {
    console.log('🔔 Checking for due date notifications for user:', currentUserId);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    const todayStart = new Date(today + 'T00:00:00').toISOString();
    const todayEnd = new Date(today + 'T23:59:59').toISOString();
    console.log('📅 Today is:', today);

    // Fetch all client boards
    const { data: boards, error: boardsError } = await supabase
      .from('client_boards')
      .select('*');

    if (boardsError || !boards) {
      console.error('Error fetching boards:', boardsError);
      return;
    }

    console.log('📊 Found', boards.length, 'boards to check');
    let notificationCount = 0;
    let skippedCount = 0;

    // Iterate through all boards and their tasks
    for (const board of boards) {
      const boardData = board.board_data as any;
      if (!boardData.groups) continue;

      for (const group of boardData.groups) {
        if (!group.tasks) continue;

        for (const task of group.tasks) {
          // Check if task is due today AND assigned to current user
          if (task.dueDate === today && task.assignedTo) {
            const assignedIds = Array.isArray(task.assignedTo)
              ? task.assignedTo
              : [task.assignedTo];

            // Only notify if this task is assigned to the current user
            if (!assignedIds.includes(currentUserId)) {
              continue; // Skip tasks not assigned to current user
            }

            console.log('⏰ YOUR task due today:', task.title);

            // Check if we already created this notification today for this specific task
            // We check linkData to ensure we match the exact task, not just similar titles
            const { data: existingNotifications } = await supabase
              .from('notifications')
              .select('id, link_data, message')
              .eq('user_id', currentUserId)
              .eq('title', 'Task Due Today')
              .gte('created_at', todayStart)
              .lte('created_at', todayEnd);

            // Check if any existing notification has this exact task ID in linkData
            // OR if the message contains this exact task title (for backwards compatibility)
            const alreadyNotified = existingNotifications?.some(n => {
              try {
                // First try to match by linkData (most accurate)
                if (n.link_data) {
                  const linkData = JSON.parse(n.link_data);
                  if (linkData.taskId === task.id && linkData.boardId === boardData.id) {
                    return true;
                  }
                }
                // Fallback: check if message contains this exact task title and board name
                const expectedMessage = `"${task.title}" is due today on ${boardData.name}`;
                return n.message === expectedMessage;
              } catch {
                return false;
              }
            });

            if (alreadyNotified) {
              console.log('⏭️ Notification already exists for task:', task.title);
              skippedCount++;
              continue;
            }

            try {
              await createNotification(
                currentUserId,
                'Task Due Today',
                `"${task.title}" is due today on ${boardData.name}`,
                'alert',
                'TASKS',
                {
                  taskId: task.id,
                  boardId: boardData.id, // Use ClientBoard ID, not database row ID
                  groupId: group.id,
                  boardName: boardData.name
                }
              );
              notificationCount++;
              console.log('✉️ Created due date notification for task:', task.title);
            } catch (notifError) {
              console.error('Failed to create notification for task:', task.title, notifError);
            }
          }
        }
      }
    }

    console.log(`✅ Due date check completed - sent ${notificationCount} new notifications, skipped ${skippedCount} duplicates`);
  } catch (error) {
    console.error('Error checking due dates:', error);
  }
};
