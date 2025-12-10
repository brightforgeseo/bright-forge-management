import React, { useState, useEffect, useRef } from 'react';
import { Hash, Plus, Trash2, Image as ImageIcon, Send, Bot, User as UserIcon, Loader2, FileText, Users, MessageSquare, RefreshCw, Edit2, X, Check, Smile, Film, SmilePlus, Video, Lock, UserPlus, Menu, ClipboardList, Calendar, ArrowRight, Palette, Paperclip, Download, File } from 'lucide-react';
import { ChatChannel, ChatMessage, User, ToastType, Profile, MessageReaction } from '../types';
import { getChatResponse } from '../services/geminiService';
import { storeEchoConversation, buildConversationContext } from '../services/echoMemory';
import { fetchChatMessages, sendChatMessage, clearChatHistory, uploadFile, fetchChannels, createChannel, deleteChannel, fetchProfiles, getOrCreateDMChannel, createNotification, editChatMessage, fetchMessageReactions, addMessageReaction, removeMessageReaction, fetchChannelMembers, addChannelMember, removeChannelMember, deleteChatMessage, isChannelMember } from '../services/databaseService';
import { supabase } from '../lib/supabaseClient';
// Removed custom VideoCall - now using Google Meet

interface TeamChatProps {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
  onNavigateToTask?: (taskId: string, boardId: string, groupId: string) => void;
}

const TeamChat: React.FC<TeamChatProps> = ({ currentUser, addToast, onNavigateToTask }) => {
  // SIMPLE STATE MODEL - No caching, no drafts
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivateChannel, setIsPrivateChannel] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Message editing state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // GIF picker state
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);

  // Reaction state
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<string, MessageReaction[]>>({});

  // Video call state (kept for backwards compatibility with existing messages)

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChannelRef = useRef<string>('');
  const channelsRef = useRef<ChatChannel[]>([]);
  const [mentionDropdown, setMentionDropdown] = useState<{ show: boolean; search: string; position: number } | null>(null);

  // Echo AI Bot User ID (fixed UUID for the bot)
  const ECHO_BOT_ID = '00000000-0000-0000-0000-000000000001';

  // Channel members state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Pagination state for messages
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

  // Chat background state - per channel
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [channelBackgrounds, setChannelBackgrounds] = useState<Record<string, { bg: string; customUrl?: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('bf_channel_backgrounds') || '{}');
    } catch { return {}; }
  });
  const bgInputRef = useRef<HTMLInputElement>(null);

  const chatBackgrounds = [
    { id: 'default', name: 'Default', style: 'bg-white', dark: false },
    { id: 'dark', name: 'Dark', style: 'bg-slate-900', dark: true },
    { id: 'gradient-blue', name: 'Ocean', style: 'bg-gradient-to-br from-blue-100 via-blue-50 to-cyan-100', dark: false },
    { id: 'gradient-purple', name: 'Purple', style: 'bg-gradient-to-br from-purple-100 via-pink-50 to-indigo-100', dark: false },
    { id: 'gradient-green', name: 'Forest', style: 'bg-gradient-to-br from-green-100 via-emerald-50 to-teal-100', dark: false },
    { id: 'gradient-sunset', name: 'Sunset', style: 'bg-gradient-to-br from-orange-100 via-red-50 to-pink-100', dark: false },
    { id: 'gradient-night', name: 'Night', style: 'bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-900', dark: true },
    { id: 'pattern-dots', name: 'Dots', style: 'bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]', dark: false },
    { id: 'pattern-grid', name: 'Grid', style: 'bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] [background-size:24px_24px]', dark: false },
  ];

  // Preset image backgrounds (free stock photos)
  const imageBackgrounds = [
    { id: 'img-mountains', name: 'Mountains', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80', dark: true },
    { id: 'img-beach', name: 'Beach', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80', dark: false },
    { id: 'img-forest', name: 'Forest', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&q=80', dark: true },
    { id: 'img-city', name: 'City', url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=80', dark: true },
    { id: 'img-space', name: 'Space', url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1200&q=80', dark: true },
    { id: 'img-clouds', name: 'Clouds', url: 'https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6?w=1200&q=80', dark: false },
  ];

  // Christmas/Holiday backgrounds
  const christmasBackgrounds = [
    { id: 'xmas-snow', name: 'Snowy', url: 'https://images.unsplash.com/photo-1517299321609-52687d1bc55a?w=1200&q=80', dark: false },
    { id: 'xmas-tree', name: 'Tree', url: 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=1200&q=80', dark: true },
    { id: 'xmas-lights', name: 'Lights', url: 'https://images.unsplash.com/photo-1513297887119-d46091b24bfa?w=1200&q=80', dark: true },
    { id: 'xmas-cozy', name: 'Cozy', url: 'https://images.unsplash.com/photo-1482517967863-00e15c9b44be?w=1200&q=80', dark: true },
    { id: 'xmas-winter', name: 'Winter', url: 'https://images.unsplash.com/photo-1418985991508-e47386d96a71?w=1200&q=80', dark: false },
    { id: 'xmas-bokeh', name: 'Bokeh', url: 'https://images.unsplash.com/photo-1543589077-47d81606c1bf?w=1200&q=80', dark: true },
  ];

  // Get current channel's background
  const getChannelBackground = () => {
    return channelBackgrounds[activeChannelId]?.bg || 'default';
  };

  const getChannelCustomUrl = () => {
    return channelBackgrounds[activeChannelId]?.customUrl || null;
  };

  const handleBackgroundChange = (bgId: string, customUrl?: string) => {
    const updated = {
      ...channelBackgrounds,
      [activeChannelId]: { bg: bgId, customUrl }
    };
    setChannelBackgrounds(updated);
    localStorage.setItem('bf_channel_backgrounds', JSON.stringify(updated));
    setShowBackgroundPicker(false);
  };

  const handleCustomBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Upload to Supabase storage
      const fileName = `chat-bg-${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage
        .from('uploads')
        .upload(fileName, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
      const url = urlData.publicUrl;

      handleBackgroundChange('custom', url);
      addToast('success', 'Background uploaded!');
    } catch (err) {
      console.error('Upload error:', err);
      addToast('error', 'Failed to upload background');
    }
  };

  const getCurrentBackgroundStyle = () => {
    const bgId = getChannelBackground();
    const customUrl = getChannelCustomUrl();
    if (bgId === 'custom' && customUrl) {
      return ''; // Will use inline style instead
    }
    if (bgId.startsWith('img-')) {
      return ''; // Will use inline style instead
    }
    const bg = chatBackgrounds.find(b => b.id === bgId);
    return bg?.style || 'bg-white';
  };

  const getCurrentBackgroundImage = () => {
    const bgId = getChannelBackground();
    const customUrl = getChannelCustomUrl();
    if (bgId === 'custom' && customUrl) {
      return customUrl;
    }
    const imgBg = imageBackgrounds.find(b => b.id === bgId);
    if (imgBg) return imgBg.url;
    const xmasBg = christmasBackgrounds.find(b => b.id === bgId);
    return xmasBg?.url || null;
  };

  const isDarkBackground = () => {
    const bgId = getChannelBackground();
    if (bgId === 'custom') return true; // Assume dark for custom images
    const imgBg = imageBackgrounds.find(b => b.id === bgId);
    if (imgBg) return imgBg.dark;
    const xmasBg = christmasBackgrounds.find(b => b.id === bgId);
    if (xmasBg) return xmasBg.dark;
    const bg = chatBackgrounds.find(b => b.id === bgId);
    return bg?.dark || false;
  };

  // Helper function to detect @mentions in text
  const detectMentions = (text: string): string[] => {
    const mentionedIds: string[] = [];

    // Check for @everyone
    if (text.toLowerCase().includes('@everyone')) {
      return profiles.map(p => p.id);
    }

    // Check for @name mentions
    profiles.forEach(profile => {
      const name = profile.full_name || '';
      const firstName = name.split(' ')[0].toLowerCase();
      const fullName = name.toLowerCase();

      if (text.toLowerCase().includes(`@${firstName}`) || text.toLowerCase().includes(`@${fullName}`)) {
        mentionedIds.push(profile.id);
      }
    });

    return mentionedIds;
  };

  // Render text with highlighted @mentions and clickable links
  const renderTextWithMentions = (text: string) => {
    // Combined regex for URLs and @mentions
    const combinedRegex = /(https?:\/\/[^\s]+)|(@everyone|@[\w\s]+?)(?=\s@|\s|$|[.,!?])/gi;
    const parts = text.split(combinedRegex).filter(Boolean);

    return parts.map((part, index) => {
      // Check if it's a URL
      if (part.match(/^https?:\/\//i)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline break-all"
          >
            {part}
          </a>
        );
      }
      // Check if it's a mention
      if (part.match(/^@/i)) {
        return (
          <span key={index} className="text-blue-600 font-semibold bg-blue-50 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Handle clicking on a shared task link
  const handleTaskLinkClick = (taskLink: ChatMessage['taskLink']) => {
    if (!taskLink) return;

    // Store task data in localStorage for TaskBoard to pick up
    localStorage.setItem('openTaskModal', JSON.stringify({
      taskId: taskLink.taskId,
      boardId: taskLink.boardId,
      groupId: taskLink.groupId
    }));

    // If onNavigateToTask is provided, use it (e.g., to switch views)
    if (onNavigateToTask) {
      onNavigateToTask(taskLink.taskId, taskLink.boardId, taskLink.groupId);
    } else {
      // Fallback: trigger storage event for any listening TaskBoard
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'openTaskModal',
        newValue: JSON.stringify({
          taskId: taskLink.taskId,
          boardId: taskLink.boardId,
          groupId: taskLink.groupId
        })
      }));
    }
  };

  // Render a task link card
  const renderTaskLinkCard = (taskLink: ChatMessage['taskLink']) => {
    if (!taskLink) return null;

    const dueDate = new Date(taskLink.dueDate);
    const isOverdue = dueDate < new Date() && taskLink.status !== 'Done';

    return (
      <button
        onClick={() => handleTaskLinkClick(taskLink)}
        className="mt-2 w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-brand-300 transition-all text-left group"
      >
        <div className="p-3">
          <div className="flex items-start gap-3">
            <div
              className="w-1 h-full min-h-[3rem] rounded-full flex-shrink-0"
              style={{ backgroundColor: taskLink.statusColor }}
            ></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">{taskLink.boardName}</span>
                <span className="text-xs text-slate-300">•</span>
                <span className="text-xs text-slate-500">{taskLink.groupTitle}</span>
              </div>
              <p className="font-semibold text-slate-900 truncate group-hover:text-brand-600 transition-colors">
                {taskLink.title}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: taskLink.statusColor }}
                >
                  {taskLink.status}
                </span>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: taskLink.priorityColor }}
                >
                  {taskLink.priority}
                </span>
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-slate-500'}`}>
                  <Calendar className="w-3 h-3" />
                  {dueDate.toLocaleDateString()}
                </span>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 transition-colors flex-shrink-0 mt-2" />
          </div>
        </div>
      </button>
    );
  };

  // Search GIFs using Giphy API
  const searchGifs = async (query: string) => {
    if (!query.trim()) {
      query = 'trending';
    }

    console.log('[searchGifs] Searching for:', query);
    setGifLoading(true);
    try {
      // Use environment variable for API key (set GIPHY_API_KEY in .env file)
      const apiKey = process.env.GIPHY_API_KEY || '';
      if (!apiKey) {
        console.warn('[searchGifs] GIPHY_API_KEY not configured');
        setGifs([]);
        setGifLoading(false);
        return;
      }
      const limit = 20;
      const endpoint = query === 'trending'
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}`
        : `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=${limit}`;

      console.log('[searchGifs] Fetching from:', endpoint);
      const response = await fetch(endpoint);
      const data = await response.json();
      console.log('[searchGifs] Response:', data);

      if (data.data && data.data.length > 0) {
        console.log('[searchGifs] Found', data.data.length, 'GIFs');
        setGifs(data.data);
      } else {
        console.warn('[searchGifs] No GIFs found in response');
        setGifs([]);
        addToast('info', 'No GIFs found');
      }
    } catch (error) {
      console.error('[searchGifs] Error fetching GIFs:', error);
      setGifs([]);
      addToast('error', 'Failed to load GIFs');
    } finally {
      setGifLoading(false);
    }
  };

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (showGifPicker && gifs.length === 0) {
      searchGifs('');
    }
  }, [showGifPicker]);

  // Close mobile sidebar when channel changes
  useEffect(() => {
    if (activeChannelId && window.innerWidth < 768) {
      setIsMobileSidebarOpen(false);
    }
  }, [activeChannelId]);

  // Load reactions for all visible messages when channel switches or messages first load
  const lastLoadedChannelRef = useRef<string>('');
  const lastLoadedMessageCountRef = useRef<number>(0);
  useEffect(() => {
    // Skip if no channel or no messages
    if (!activeChannelId || messages.length === 0) {
      return;
    }

    // Load reactions when:
    // 1. Switching to a new channel
    // 2. Initial load of messages (lastLoadedMessageCountRef was 0)
    const isNewChannel = activeChannelId !== lastLoadedChannelRef.current;
    const isInitialLoad = lastLoadedMessageCountRef.current === 0 && messages.length > 0;

    if (!isNewChannel && !isInitialLoad) {
      lastLoadedMessageCountRef.current = messages.length;
      return;
    }

    const loadReactions = async () => {
      // Load reactions in parallel for better performance
      const messageIds = messages.map(m => m.id);
      const reactionsPromises = messageIds.map(async (id) => {
        const reactions = await fetchMessageReactions(id);
        return { id, reactions };
      });

      const results = await Promise.all(reactionsPromises);
      const reactionData: Record<string, MessageReaction[]> = {};
      for (const { id, reactions } of results) {
        if (reactions.length > 0) {
          reactionData[id] = reactions;
        }
      }
      setMessageReactions(reactionData);
      lastLoadedChannelRef.current = activeChannelId;
      lastLoadedMessageCountRef.current = messages.length;
    };

    loadReactions();
  }, [messages, activeChannelId]);

  // Presence Tracking
  useEffect(() => {
    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setProfiles(prev => prev.map(profile => {
          const isOnline = Object.keys(state).includes(profile.id);
          return { ...profile, isOnline };
        }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user: currentUser.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    const heartbeat = setInterval(() => {
      presenceChannel.track({
        user: currentUser.id,
        online_at: new Date().toISOString(),
      });
    }, 30000);

    return () => {
      clearInterval(heartbeat);
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUser.id]);

  // Keep channelsRef in sync with channels state
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // Load Data
  const refreshData = async () => {
    setIsRefreshing(true);
    const [chans, profs] = await Promise.all([fetchChannels(), fetchProfiles()]);
    setChannels(chans);
    setProfiles(profs);
    setIsRefreshing(false);
    return chans;
  };

  // Helper: Parse DM channel name to get participant IDs
  const parseDMChannel = (channelName: string): string[] => {
    const dmPrefix = 'dm_';
    if (!channelName.startsWith(dmPrefix)) return [];
    return channelName.substring(dmPrefix.length).split('_').filter(id => id.length > 0);
  };

  // Helper: Check if channel is an Echo AI DM
  const isEchoAIChannel = (channel: ChatChannel): boolean => {
    if (channel.type !== 'dm') return false;
    const ids = parseDMChannel(channel.name);
    return ids.includes(ECHO_BOT_ID);
  };

  // Helper: Check if user is participant in DM
  const isUserInDM = (channel: ChatChannel, userId: string): boolean => {
    if (channel.type !== 'dm') return false;
    const ids = parseDMChannel(channel.name);
    return ids.includes(userId);
  };

  // Helper: Get other user info in DM
  const getDMInfo = (ch: ChatChannel) => {
    if (ch.type !== 'dm') return { name: ch.name, avatar: null, isOnline: false };
    const ids = parseDMChannel(ch.name);
    const otherId = ids.find(id => id !== currentUser.id);

    if (!otherId) {
      return { name: 'You', avatar: currentUser.avatarUrl, isOnline: false };
    }

    // Check if this is Echo AI
    if (otherId === ECHO_BOT_ID) {
      return { name: 'Echo AI', avatar: 'bot', isOnline: true };
    }

    const prof = profiles.find(p => p.id === otherId);

    let displayName = 'Loading...';
    if (prof) {
      displayName = prof.full_name || prof.email?.split('@')[0] || `User ${otherId.substring(0, 8)}`;
    } else if (profiles.length > 0) {
      displayName = `User ${otherId.substring(0, 8)}`;
    }

    return {
      name: displayName,
      avatar: prof?.avatar_url || null,
      isOnline: prof?.isOnline || false
    };
  };

  // Initial Load
  useEffect(() => {
    const init = async () => {
      const chans = await refreshData();

      // Check for notification click (chat navigation)
      const openChatNotification = localStorage.getItem('openChatNotification');
      if (openChatNotification) {
        try {
          const chatData = JSON.parse(openChatNotification);
          console.log('[TeamChat] Opening chat from notification:', chatData);

          // Find the channel by ID
          const targetChannel = chans.find(c => c.id === chatData.channelId);
          if (targetChannel) {
            setActiveChannelId(targetChannel.id);
            console.log('[TeamChat] Switched to channel:', targetChannel.name);
          } else {
            console.warn('[TeamChat] Channel not found:', chatData.channelId);
          }

          localStorage.removeItem('openChatNotification');
        } catch (e) {
          console.error('[TeamChat] Failed to parse chat notification:', e);
          localStorage.removeItem('openChatNotification');
        }
      } else if (chans.length > 0 && !activeChannelId) {
        // No notification - default to general
        const general = chans.find(c => c.name === 'general');
        setActiveChannelId(general ? general.id : chans[0].id);
      }
    };
    init();

    // Realtime Channel/Profile Listeners
    const channelSub = supabase.channel('public:channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, async () => {
        const newChans = await fetchChannels();
        setChannels(newChans);
      })
      .subscribe();

    const profileSub = supabase.channel('public:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
        setProfiles(await fetchProfiles());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelSub);
      supabase.removeChannel(profileSub);
    };
  }, []);

  // SIMPLIFIED MESSAGE LISTENER - Only update current channel
  useEffect(() => {
    console.log('[TeamChat] Setting up realtime subscription for messages...');
    const msgSub = supabase.channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const newMsg = payload.new as any;
        console.log('[TeamChat] ✅ REALTIME: New message received:', newMsg.id, newMsg);

        const formattedMsg: ChatMessage = {
          id: newMsg.id,
          channelId: newMsg.channel_id,
          sender: newMsg.sender,
          senderId: newMsg.sender_id,
          text: newMsg.text,
          timestamp: newMsg.created_at,
          isAi: newMsg.is_ai,
          avatar: newMsg.avatar,
          attachmentUrl: newMsg.attachment_url,
          attachmentType: newMsg.attachment_type,
          attachmentName: newMsg.attachment_name,
          isEdited: newMsg.is_edited,
          editedAt: newMsg.edited_at,
          taskLink: newMsg.task_link,
          callRoomId: newMsg.call_room_id,
          callType: newMsg.call_type
        };

        // Only update if message is for current channel
        if (newMsg.channel_id === activeChannelRef.current) {
          setMessages(prev => {
            // Simple duplicate check by ID only
            if (prev.some(m => m.id === newMsg.id)) {
              console.log('[TeamChat] Message already exists, skipping');
              return prev;
            }
            console.log('[TeamChat] Adding message to current channel');
            return [...prev, formattedMsg];
          });
          scrollToBottom();
        } else {
          // Message is for different channel - update unread count
          console.log('[TeamChat] Message for different channel, updating unread count');
          // Use ref to access current channels without triggering subscription recreation
          let targetChannel = channelsRef.current.find(c => c.id === newMsg.channel_id);

          if (!targetChannel) {
            const updatedChannels = await fetchChannels();
            setChannels(updatedChannels.map(c =>
              c.id === newMsg.channel_id ? { ...c, unread: 1 } : c
            ));
            targetChannel = updatedChannels.find(c => c.id === newMsg.channel_id);
          } else {
            setChannels(prev => prev.map(c =>
              c.id === newMsg.channel_id ? { ...c, unread: (c.unread || 0) + 1 } : c
            ));
          }

          // Show notification only for channels the user is part of
          // Note: targetChannel will only exist if user has access (fetchChannels filters by membership)
          if (targetChannel && !newMsg.is_ai && newMsg.sender !== currentUser.name) {
            if (targetChannel.type === 'dm') {
              if (isUserInDM(targetChannel, currentUser.id)) {
                addToast('info', `${newMsg.sender}: ${newMsg.text.substring(0, 50)}${newMsg.text.length > 50 ? '...' : ''}`);
              }
            } else {
              // Only show toast if user has this channel in their list
              // (private channels not in user's list won't reach here due to fetchChannels filtering)
              addToast('info', `New message in #${targetChannel.name}`);
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const updatedMsg = payload.new as any;
        console.log('[TeamChat] Message UPDATE received:', updatedMsg.id);

        // Only update if this is the active channel
        if (updatedMsg.channel_id === activeChannelRef.current) {
          setMessages(prev => prev.map(m =>
            m.id === updatedMsg.id ? {
              ...m,
              text: updatedMsg.text,
              isEdited: updatedMsg.is_edited,
              editedAt: updatedMsg.edited_at
            } : m
          ));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const deletedMsg = payload.old as any;
        console.log('[TeamChat] Message DELETE received:', deletedMsg.id);

        // Remove from UI if it's in the current channel
        if (deletedMsg.channel_id === activeChannelRef.current) {
          setMessages(prev => prev.filter(m => m.id !== deletedMsg.id));
        }
      })
      .subscribe((status) => {
        console.log('[TeamChat] Message subscription status:', status);
      });

    // Real-time reactions subscription
    const reactionsSub = supabase.channel('public:message_reactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async (payload) => {
        const reactionData = payload.new as any;
        const messageId = reactionData?.message_id || (payload.old as any)?.message_id;

        if (!messageId) return;

        const updatedReactions = await fetchMessageReactions(messageId);
        setMessageReactions(prev => ({
          ...prev,
          [messageId]: updatedReactions
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
      supabase.removeChannel(reactionsSub);
    };
  }, [currentUser.id, currentUser.name]); // Removed 'channels' to prevent subscription recreation on every unread update

  // SIMPLIFIED CHANNEL SWITCH - Always fetch fresh from database
  useEffect(() => {
    if (!activeChannelId) return;

    // Capture the channel ID for this effect run to prevent race conditions
    const currentChannelId = activeChannelId;

    // Update ref
    activeChannelRef.current = activeChannelId;

    // Reset reaction loading tracker when changing channels
    lastLoadedMessageCountRef.current = 0;

    const loadMessages = async () => {
      console.log('[TeamChat] Switching to channel:', currentChannelId);
      console.log('[TeamChat] Fetching fresh messages from database');

      // Clear current messages and reactions immediately
      setMessages([]);
      setMessageReactions({});
      setHasMoreMessages(false);

      // Fetch fresh from database (last 100 messages)
      const msgs = await fetchChatMessages(currentChannelId);

      // CRITICAL: Check if user switched channels while we were fetching
      // If they did, don't update state with stale data
      if (activeChannelRef.current !== currentChannelId) {
        console.log('[TeamChat] Channel changed during fetch, discarding stale messages');
        return;
      }

      console.log(`[TeamChat] Loaded ${msgs.length} messages from database`);

      setMessages(msgs);
      // If we got exactly 100 messages, there might be more
      setHasMoreMessages(msgs.length === 100);
      scrollToBottom();

      // Reset unread count
      setChannels(prev => prev.map(c =>
        c.id === currentChannelId ? { ...c, unread: 0 } : c
      ));

      // For private channels, load members so we can filter the mention dropdown
      const currentChannel = channelsRef.current.find(c => c.id === currentChannelId);
      if (currentChannel?.is_private) {
        try {
          const members = await fetchChannelMembers(currentChannelId);
          if (activeChannelRef.current === currentChannelId) {
            setChannelMembers(members || []);
          }
        } catch (e) {
          console.error('[TeamChat] Failed to load channel members:', e);
        }
      }
    };

    loadMessages();
  }, [activeChannelId]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Load older messages (pagination)
  const loadMoreMessages = async () => {
    if (!activeChannelId || loadingMoreMessages || !hasMoreMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setLoadingMoreMessages(true);
    try {
      const olderMsgs = await fetchChatMessages(activeChannelId, 100, oldestMessage.timestamp);

      if (olderMsgs.length > 0) {
        setMessages(prev => [...olderMsgs, ...prev]);
        // If we got less than 100 messages, we've reached the beginning
        setHasMoreMessages(olderMsgs.length === 100);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('[TeamChat] Error loading more messages:', error);
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      const newCh = await createChannel(
        newChannelName,
        'channel',
        isPrivateChannel,
        isPrivateChannel ? currentUser.id : undefined
      );
      setNewChannelName('');
      setIsPrivateChannel(false);
      setShowCreateChannel(false);
      if (newCh) {
        setChannels(prev => [...prev, newCh]);
        setActiveChannelId(newCh.id);
      }
      addToast('success', `${isPrivateChannel ? 'Private' : 'Public'} channel created`);
    } catch (e) {
      console.error('Channel creation error:', e);
      addToast('error', `Failed to create channel: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const loadChannelMembers = async (channelId: string) => {
    setLoadingMembers(true);
    try {
      const members = await fetchChannelMembers(channelId);
      console.log('Loaded members:', members);
      setChannelMembers(members || []);
    } catch (e) {
      console.error('Load members error:', e);
      addToast('error', `Failed to load channel members: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleInviteUser = async (channelId: string, userId: string) => {
    console.log('[handleInviteUser] channelId:', channelId, 'userId:', userId);

    // Optimistically update UI first
    const invitedProfile = profiles.find(p => p.id === userId);
    console.log('[handleInviteUser] invitedProfile:', invitedProfile);

    if (invitedProfile) {
      setChannelMembers(prev => [...prev, {
        id: `temp-${userId}`,
        channel_id: channelId,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
        profiles: invitedProfile
      }]);
    }

    // Then sync with database in background
    try {
      await addChannelMember(channelId, userId, 'member', currentUser.id);
      addToast('success', 'User invited to channel');
      // Reload to get correct data with real IDs
      loadChannelMembers(channelId);
    } catch (e: any) {
      console.error('Invite user error:', e);
      const errorMsg = e?.message || e?.details || 'Unknown error';
      alert(`Failed to add member: ${errorMsg}\n\nCode: ${e?.code || 'none'}\nHint: ${e?.hint || 'none'}\nUserId: ${userId}\nChannelId: ${channelId}`);
      addToast('error', `Failed to invite user: ${errorMsg}`);
      // Revert optimistic update on error
      setChannelMembers(prev => prev.filter(m => m.user_id !== userId));
    }
  };

  const handleRemoveMember = async (channelId: string, userId: string) => {
    // Optimistically update UI first
    setChannelMembers(prev => prev.filter(m => m.user_id !== userId));

    // Then sync with database in background
    try {
      await removeChannelMember(channelId, userId);
      addToast('success', 'User removed from channel');
    } catch (e) {
      addToast('error', 'Failed to remove user');
      // Reload on error to restore correct state
      loadChannelMembers(channelId);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    try {
      await deleteChannel(id);
      setChannels(prev => prev.filter(c => c.id !== id));

      if (activeChannelId === id) {
        const remaining = channels.filter(c => c.id !== id);
        const general = remaining.find(c => c.name === 'general');
        setActiveChannelId(general ? general.id : (remaining[0]?.id || ''));
      }

      addToast('success', 'Conversation deleted');
    } catch (e) {
      console.error('Delete error:', e);
      addToast('error', 'Failed to delete');
    }
  };

  const handleStartDM = async (targetProfileId: string) => {
    try {
      if (targetProfileId === currentUser.id) {
        addToast('info', 'Cannot message yourself!');
        return;
      }

      const dmChannel = await getOrCreateDMChannel(currentUser.id, targetProfileId);

      if (!dmChannel || !dmChannel.id) {
        throw new Error('DM channel creation failed');
      }

      setChannels(prev => {
        if (prev.find(c => c.id === dmChannel.id)) {
          return prev;
        }
        return [...prev, dmChannel];
      });

      setActiveChannelId(dmChannel.id);
      addToast('success', 'DM conversation opened!');
    } catch (e: any) {
      console.error('DM error:', e);
      addToast('error', 'Could not start DM: ' + (e?.message || 'Unknown error'));
    }
  };

  const handleStartEchoAI = async () => {
    try {
      const echoChannel = await getOrCreateDMChannel(currentUser.id, ECHO_BOT_ID);

      if (!echoChannel || !echoChannel.id) {
        throw new Error('Echo AI channel creation failed');
      }

      setChannels(prev => {
        if (prev.find(c => c.id === echoChannel.id)) {
          return prev;
        }
        return [...prev, echoChannel];
      });

      setActiveChannelId(echoChannel.id);
      addToast('success', 'Echo AI chat opened!');
    } catch (e: any) {
      console.error('Echo AI error:', e);
      addToast('error', 'Could not start Echo AI: ' + (e?.message || 'Unknown error'));
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingText.trim()) return;

    try {
      await editChatMessage(messageId, editingText);

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, text: editingText, isEdited: true, editedAt: new Date().toISOString() }
          : m
      ));

      setEditingMessageId(null);
      setEditingText('');
      addToast('success', 'Message updated');
    } catch (error) {
      console.error('Failed to edit message:', error);
      addToast('error', 'Failed to update message');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleDeleteMessage = async (messageId: string, messageText: string) => {
    const preview = messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '');
    if (!window.confirm(`Delete this message?\n\n"${preview}"`)) {
      return;
    }

    try {
      console.log('[TeamChat] Deleting message:', messageId);
      await deleteChatMessage(messageId);
      console.log('[TeamChat] Message deleted successfully from database');

      // Remove message from UI immediately
      setMessages(prev => prev.filter(m => m.id !== messageId));

      addToast('success', 'Message deleted');
    } catch (error: any) {
      console.error('[TeamChat] Failed to delete message:', error);
      addToast('error', `Failed to delete: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    // Validate messageId is a valid UUID before attempting database operations
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(messageId)) {
      console.warn('[handleReaction] Invalid message ID (not a UUID), skipping:', messageId);
      addToast('error', 'Cannot add reaction - message still syncing');
      return;
    }

    try {
      const reactions = messageReactions[messageId] || [];
      const existingReaction = reactions.find(r => r.emoji === emoji);

      if (existingReaction && existingReaction.userIds.includes(currentUser.id)) {
        await removeMessageReaction(messageId, currentUser.id, emoji);

        setMessageReactions(prev => {
          const updated = { ...prev };
          const msgReactions = updated[messageId] || [];
          updated[messageId] = msgReactions
            .map(r => {
              if (r.emoji === emoji) {
                return {
                  ...r,
                  userIds: r.userIds.filter(id => id !== currentUser.id),
                  count: r.count - 1
                };
              }
              return r;
            })
            .filter(r => r.count > 0);
          return updated;
        });
      } else {
        await addMessageReaction(messageId, currentUser.id, emoji);

        setMessageReactions(prev => {
          const updated = { ...prev };
          const msgReactions = updated[messageId] || [];
          const existingIdx = msgReactions.findIndex(r => r.emoji === emoji);

          if (existingIdx >= 0) {
            msgReactions[existingIdx] = {
              ...msgReactions[existingIdx],
              userIds: [...msgReactions[existingIdx].userIds, currentUser.id],
              count: msgReactions[existingIdx].count + 1
            };
          } else {
            msgReactions.push({
              emoji,
              userIds: [currentUser.id],
              count: 1
            });
          }

          updated[messageId] = msgReactions;
          return updated;
        });
      }

      setShowReactionPicker(null);
    } catch (error) {
      console.error('Error handling reaction:', error);
      addToast('error', 'Failed to add reaction');
    }
  };

  // Video Call - Using Jitsi Meet (free, no account needed, instant rooms)
  const startVideoCall = async () => {
    // Generate unique room name from channel ID + timestamp
    const roomName = `BrightForge-${activeChannelId.slice(0, 8)}-${Date.now().toString(36)}`;
    const meetUrl = `https://meet.jit.si/${roomName}`;

    // Send clickable link to channel
    const callMsg: ChatMessage = {
      id: Date.now().toString(),
      channelId: activeChannelId,
      sender: currentUser.name,
      senderId: currentUser.id,
      text: `📹 Started a video call!\n\n👉 Join here: ${meetUrl}`,
      timestamp: new Date().toISOString(),
      avatar: currentUser.avatarUrl || 'user'
    };
    await sendChatMessage(callMsg);

    // Open in new tab
    window.open(meetUrl, '_blank');
    addToast('success', 'Video call started!');
  };

  // SIMPLIFIED SEND MESSAGE - No optimistic updates, wait for database
  const handleSendMessage = async () => {
    console.log('[handleSendMessage] Starting...');
    console.log('[handleSendMessage] Message text:', message);
    console.log('[handleSendMessage] Active channel ID:', activeChannelId);

    if (!message.trim()) {
      console.log('[handleSendMessage] Empty message, aborting');
      return;
    }

    const currentCh = channels.find(c => c.id === activeChannelId);
    console.log('[handleSendMessage] Current channel:', currentCh);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      channelId: activeChannelId,
      sender: currentUser.name,
      senderId: currentUser.id,
      text: message,
      timestamp: new Date().toISOString(),
      avatar: currentUser.avatarUrl || 'user'
    };

    console.log('[handleSendMessage] Constructed message:', userMsg);

    const mentions = detectMentions(message.trim());
    const messageText = message;
    setMessage('');
    setMentionDropdown(null);

    // Send to database - realtime listener will add it to UI
    console.log('[handleSendMessage] Calling sendChatMessage...');
    try {
      const result = await sendChatMessage(userMsg);
      console.log('[handleSendMessage] Message sent successfully:', result);

      // TEMPORARY WORKAROUND: Manually add message to UI since realtime might not be working
      console.log('[handleSendMessage] Adding message to UI manually...');
      const insertedMsg: ChatMessage = {
        id: result.id,
        channelId: result.channel_id,
        sender: result.sender,
        senderId: result.sender_id,
        text: result.text,
        timestamp: result.created_at,
        isAi: result.is_ai,
        avatar: result.avatar,
        attachmentUrl: result.attachment_url,
        attachmentType: result.attachment_type,
        attachmentName: result.attachment_name,
        isEdited: result.is_edited,
        editedAt: result.edited_at,
        taskLink: result.task_link
      };

      setMessages(prev => {
        // Check if already exists (in case realtime DID work)
        if (prev.some(m => m.id === insertedMsg.id)) {
          console.log('[handleSendMessage] Message already in UI (realtime worked!)');
          return prev;
        }
        console.log('[handleSendMessage] Adding message to UI manually');
        return [...prev, insertedMsg];
      });
      scrollToBottom();
    } catch (error: any) {
      console.error('[handleSendMessage] Failed to send message:', error);
      console.error('[handleSendMessage] Error details:', error.message, error.details, error.hint);
      const errorMsg = error.message || error.details || 'Unknown error';
      alert(`Message failed: ${errorMsg}\n\nCode: ${error.code || 'none'}\nHint: ${error.hint || 'none'}`);
      addToast('error', `Failed to send message: ${errorMsg}`);
      setMessage(messageText); // Restore message on error
      return;
    }

    // Create Notification if DM (but not for Echo AI)
    if (currentCh?.type === 'dm' && !isEchoAIChannel(currentCh)) {
      const ids = parseDMChannel(currentCh.name);
      const otherId = ids.find(id => id !== currentUser.id);
      if (otherId && otherId !== currentUser.id) {
        await createNotification(
          otherId,
          'New Direct Message',
          `${currentUser.name}: ${userMsg.text.substring(0, 100)}`,
          'message',
          'TEAM_CHAT',
          {
            channelId: activeChannelId,
            channelName: currentCh.name,
            channelType: 'dm'
          }
        );
      }
    }

    // Create notifications for @mentions (only for members of private channels)
    if (currentCh?.type === 'channel' && mentions.length > 0) {
      for (const mentionedId of mentions) {
        if (mentionedId !== currentUser.id) {
          // For private channels, verify the mentioned user is actually a member
          if (currentCh.is_private) {
            const isMember = await isChannelMember(currentCh.id, mentionedId);
            if (!isMember) {
              console.log(`[Notification] Skipping notification for non-member ${mentionedId} in private channel ${currentCh.name}`);
              continue; // Skip notification if not a member
            }
          }
          await createNotification(
            mentionedId,
            `${currentUser.name} mentioned you in #${currentCh.name}`,
            userMsg.text.substring(0, 100),
            'message',
            'TEAM_CHAT',
            {
              channelId: activeChannelId,
              channelName: currentCh.name,
              channelType: 'channel'
            }
          );
        }
      }
    }

    // AI Response for Echo AI DM channels
    if (currentCh && isEchoAIChannel(currentCh)) {
      setLoading(true);
      try {
        // Build context from conversation history
        const recentHistory = messages.slice(-10).map(m => `${m.sender}: ${m.text}`).join('\n');

        // Get past conversation context (if available)
        let pastContext = '';
        try {
          pastContext = await buildConversationContext(currentUser.id, activeChannelId);
        } catch (e) {
          console.log('[Echo] Past context not available yet');
        }

        const fullHistory = pastContext + '\n\n' + recentHistory;
        const response = await getChatResponse(fullHistory, userMsg.text);

        // Send Echo's response - let real-time listener add it to UI
        const aiMsg: ChatMessage = {
          id: '', // Let database generate ID
          channelId: activeChannelId,
          sender: 'Echo AI',
          senderId: currentUser.id, // Use current user's ID to satisfy FK constraint
          text: response,
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        };

        const aiResult = await sendChatMessage(aiMsg);
        // Manually add AI message to UI (same as user messages) since realtime may be unreliable
        const insertedAiMsg: ChatMessage = {
          id: aiResult.id,
          channelId: aiResult.channel_id,
          sender: aiResult.sender,
          senderId: aiResult.sender_id,
          text: aiResult.text,
          timestamp: aiResult.created_at,
          isAi: aiResult.is_ai,
          avatar: aiResult.avatar,
          attachmentUrl: aiResult.attachment_url,
          attachmentType: aiResult.attachment_type,
          isEdited: aiResult.is_edited,
          editedAt: aiResult.edited_at,
          taskLink: aiResult.task_link
        };
        setMessages(prev => {
          if (prev.some(m => m.id === insertedAiMsg.id)) {
            return prev;
          }
          return [...prev, insertedAiMsg];
        });
        scrollToBottom();

        // Store conversation for future memory
        try {
          await storeEchoConversation(
            currentUser.id,
            activeChannelId,
            userMsg.text,
            response
          );
        } catch (e) {
          console.log('[Echo] Could not store conversation (table may not exist yet)');
        }
      } catch (err) {
        console.error('[Echo] Error:', err);
        addToast('error', 'Echo AI unavailable');
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          setIsUploading(true);
          const url = await uploadFile(file);
          setIsUploading(false);
          if (url) {
            await sendChatMessage({
              id: Date.now().toString(),
              channelId: activeChannelId,
              sender: currentUser.name,
              senderId: currentUser.id,
              text: 'Sent an image from clipboard',
              timestamp: new Date().toISOString(),
              avatar: currentUser.avatarUrl || 'user',
              attachmentUrl: url,
              attachmentType: 'image'
            });

            const currentCh = channels.find(c => c.id === activeChannelId);
            if (currentCh?.type === 'dm') {
              const ids = parseDMChannel(currentCh.name);
              const otherId = ids.find(id => id !== currentUser.id);
              if (otherId && otherId !== currentUser.id) {
                await createNotification(
                  otherId,
                  'New Attachment',
                  `${currentUser.name} sent an image`,
                  'message',
                  'TEAM_CHAT',
                  { channelId: activeChannelId, channelName: currentCh.name, channelType: 'dm' }
                );
              }
            }
          } else {
            addToast('error', 'Failed to upload image from clipboard');
          }
        }
        return;
      }
    }

    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const textarea = e.currentTarget;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const currentValue = textarea.value;

    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
    setMessage(newValue);

    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    setIsUploading(true);
    const url = await uploadFile(e.target.files[0]);
    setIsUploading(false);
    if (url) {
      const file = e.target.files[0];
      const mimeType = file.type;
      let type: 'image' | 'video' | 'file' = 'file';
      if (mimeType.startsWith('image/')) type = 'image';
      else if (mimeType.startsWith('video/')) type = 'video';

      const fileName = file.name;
      let displayText = `Sent file: ${fileName}`;
      if (type === 'image') displayText = 'Sent an image';
      else if (type === 'video') displayText = 'Sent a video';

      await sendChatMessage({
        id: Date.now().toString(),
        channelId: activeChannelId,
        sender: currentUser.name,
        senderId: currentUser.id,
        text: displayText,
        timestamp: new Date().toISOString(),
        avatar: currentUser.avatarUrl || 'user',
        attachmentUrl: url,
        attachmentType: type,
        attachmentName: fileName
      });

      const currentCh = channels.find(c => c.id === activeChannelId);
      if (currentCh?.type === 'dm') {
        const ids = parseDMChannel(currentCh.name);
        const otherId = ids.find(id => id !== currentUser.id);
        if (otherId && otherId !== currentUser.id) {
          await createNotification(
            otherId,
            'New Attachment',
            `${currentUser.name} sent an attachment`,
            'message',
            'TEAM_CHAT',
            { channelId: activeChannelId, channelName: currentCh.name, channelType: 'dm' }
          );
        }
      }
    } else {
      addToast('error', 'Upload failed');
    }
  };

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const isChannelReadOnly = false;
  // Filter out the old echo-ai channel if it exists
  const publicChannels = channels.filter(c => c.type !== 'dm' && c.name !== 'echo-ai');
  const allDmChannels = channels.filter(c => isUserInDM(c, currentUser.id));
  const echoAIChannel = allDmChannels.find(c => isEchoAIChannel(c));
  const dmChannels = allDmChannels.filter(c => !isEchoAIChannel(c));

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Channels Sidebar */}
      <div className={`
        w-72 md:w-64 bg-[#3F0E40] flex flex-col flex-shrink-0
        fixed md:relative inset-y-0 left-0 z-50
        transform transition-transform duration-300 ease-out
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="h-14 md:h-11 px-3 flex items-center justify-between border-b border-[#5d2c5d] flex-shrink-0 safe-area-inset-top">
          <h2 className="font-bold text-white truncate text-base md:text-sm">Bright Forge</h2>
          <div className="flex items-center gap-2 md:gap-1">
            {currentUser.role === 'Owner' && (
              <button onClick={() => setShowCreateChannel(true)} className="p-2 md:p-1 text-slate-300 hover:text-white hover:bg-[#5d2c5d] rounded-lg md:rounded transition-colors active:bg-[#4d1c4d]" title="New Channel">
                <Plus className="w-5 h-5 md:w-4 md:h-4" />
              </button>
            )}
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-[#5d2c5d] rounded-lg transition-colors active:bg-[#4d1c4d]"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showCreateChannel && (
          <div className="p-2 bg-[#350d36] border-b border-[#5d2c5d]">
            <input
              autoFocus
              className="w-full text-xs p-1 rounded text-slate-900 outline-none mb-1"
              placeholder="channel-name"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
            />
            <label className="flex items-center text-xs text-[#bcabbc] mb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivateChannel}
                onChange={e => setIsPrivateChannel(e.target.checked)}
                className="mr-2"
              />
              Private channel (only invited members can access)
            </label>
            <div className="flex gap-1">
              <button onClick={handleCreateChannel} className="flex-1 bg-green-600 text-white text-[10px] py-0.5 rounded">Create</button>
              <button onClick={() => setShowCreateChannel(false)} className="flex-1 bg-slate-600 text-white text-[10px] py-0.5 rounded">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar py-2 space-y-3 min-h-0">
          {/* AI Assistant Section */}
          <div>
            <div className="px-3 flex items-center justify-between group text-[#bcabbc] mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider">AI Assistant</span>
            </div>
            <ul>
              {echoAIChannel ? (
                <li
                  key={echoAIChannel.id}
                  onClick={() => setActiveChannelId(echoAIChannel.id)}
                  className={`px-3 py-2.5 md:py-1.5 flex items-center justify-between cursor-pointer mx-1.5 rounded-lg md:rounded group active:opacity-80 ${activeChannelId === echoAIChannel.id ? 'bg-[#1164A3] text-white' : 'text-[#bcabbc] hover:bg-[#350d36]'}`}
                >
                  <div className="flex items-center gap-2 md:gap-1.5 truncate">
                    <Bot className="w-4 h-4 md:w-3.5 md:h-3.5 text-brand-400" />
                    <span className={`truncate text-base md:text-sm ${echoAIChannel.unread ? 'font-bold text-white' : ''}`}>
                      Echo AI {echoAIChannel.unread ? `(${echoAIChannel.unread})` : ''}
                    </span>
                  </div>
                </li>
              ) : (
                <li
                  onClick={handleStartEchoAI}
                  className="px-3 py-2.5 md:py-1.5 flex items-center gap-2 md:gap-1.5 mx-1.5 rounded-lg md:rounded text-[#bcabbc] hover:bg-[#350d36] cursor-pointer active:opacity-80"
                >
                  <Bot className="w-4 h-4 md:w-3.5 md:h-3.5 text-brand-400" />
                  <span className="truncate text-base md:text-sm">Start Echo AI Chat</span>
                </li>
              )}
            </ul>
          </div>

          {/* Public Channels */}
          <div>
            <div className="px-3 flex items-center justify-between group text-[#bcabbc] mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Channels</span>
            </div>
            <ul>
              {publicChannels.map(channel => (
                <li
                  key={channel.id}
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`px-3 py-2.5 md:py-1.5 flex items-center justify-between cursor-pointer mx-1.5 rounded-lg md:rounded group active:opacity-80 ${activeChannelId === channel.id ? 'bg-[#1164A3] text-white' : 'text-[#bcabbc] hover:bg-[#350d36]'}`}
                >
                  <div className="flex items-center truncate">
                    {channel.is_private ? (
                      <Lock className="w-4 h-4 md:w-3.5 md:h-3.5 mr-2 md:mr-1.5 opacity-70" />
                    ) : (
                      <Hash className="w-4 h-4 md:w-3.5 md:h-3.5 mr-2 md:mr-1.5 opacity-70" />
                    )}
                    <span className={`truncate text-base md:text-sm ${channel.unread ? 'font-bold text-white' : ''}`}>
                      {channel.name} {channel.unread ? `(${channel.unread})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {channel.is_private && channel.owner_id === currentUser.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMembersModal(true);
                          loadChannelMembers(channel.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-400"
                        title="Manage members"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    )}
                    {currentUser.role === 'Owner' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete #${channel.name} and all its messages?`)) {
                            handleDeleteChannel(channel.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400"
                      title="Delete channel"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Direct Messages List */}
          <div>
            <div className="px-3 flex items-center justify-between group text-[#bcabbc] mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Direct Messages</span>
              <button onClick={refreshData} title="Refresh List" className={`${isRefreshing ? 'animate-spin' : ''} hover:text-white`}>
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            </div>
            <ul>
              {dmChannels.map(channel => {
                const { name, avatar, isOnline } = getDMInfo(channel);
                return (
                  <li
                    key={channel.id}
                    onClick={() => setActiveChannelId(channel.id)}
                    className={`px-3 py-2.5 md:py-1.5 flex items-center gap-2 md:gap-1.5 mx-1.5 rounded-lg md:rounded group cursor-pointer active:opacity-80 ${activeChannelId === channel.id ? 'bg-[#1164A3] text-white' : 'text-[#bcabbc] hover:bg-[#350d36]'}`}
                  >
                    <div className="relative w-5 h-5 md:w-4 md:h-4 flex-shrink-0">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-5 h-5 md:w-4 md:h-4 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 md:w-4 md:h-4 rounded-full bg-green-600 flex items-center justify-center text-[9px] md:text-[8px] text-white font-bold">
                          {name.charAt(0)}
                        </div>
                      )}
                      {channel.unread ? (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 md:w-2 md:h-2 bg-red-500 rounded-full border border-[#3F0E40]" title="Unread messages"></div>
                      ) : isOnline ? (
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-2 md:h-2 bg-green-500 rounded-full border border-[#3F0E40]" title="Online"></div>
                      ) : null}
                    </div>
                    <span className={`truncate text-base md:text-sm flex-1 ${channel.unread ? 'font-bold text-white' : ''}`}>
                      {name} {channel.unread ? `(${channel.unread})` : ''}
                      {isOnline && !channel.unread && <span className="ml-1 text-[10px] text-green-400">●</span>}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete conversation with ${name}?`)) {
                          handleDeleteChannel(channel.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 flex-shrink-0 p-1"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-4 h-4 md:w-3 md:h-3" />
                    </button>
                  </li>
                );
              })}
              {dmChannels.length === 0 && <li className="px-3 text-[10px] text-slate-500 italic">No active chats</li>}
            </ul>
          </div>

          {/* All Team Members */}
          <div>
            <div className="px-3 flex items-center justify-between group text-[#bcabbc] mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Team</span>
              <Users className="w-2.5 h-2.5" />
            </div>
            <ul>
              {profiles.map(p => (
                <li
                  key={p.id}
                  onClick={() => handleStartDM(p.id)}
                  className="px-3 py-2.5 md:py-1.5 flex items-center gap-2 md:gap-1.5 mx-1.5 text-[#bcabbc] hover:bg-[#350d36] rounded-lg md:rounded cursor-pointer transition-colors active:opacity-80"
                >
                  <div className="relative">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-5 h-5 md:w-3.5 md:h-3.5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 md:w-3.5 md:h-3.5 rounded-full bg-slate-500 flex items-center justify-center text-[9px] md:text-[7px] text-white font-bold">
                        {p.full_name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 md:w-1.5 md:h-1.5 rounded-full border border-[#3F0E40] ${
                        p.isOnline ? 'bg-green-500' : 'bg-slate-400'
                      }`}
                      title={p.isOnline ? 'Online' : 'Offline'}
                    />
                  </div>
                  <span className="truncate text-base md:text-sm flex-1">
                    {p.full_name || p.email?.split('@')[0] || 'Team Member'}
                    {p.id === currentUser.id && ' (You)'}
                  </span>
                  {p.isOnline && p.id !== currentUser.id && (
                    <span className="text-[10px] md:text-[9px] text-green-400 font-medium">●</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-white h-full">
        <div className="h-14 md:h-16 border-b border-slate-200 flex items-center justify-between px-2 md:px-6 flex-shrink-0 bg-white safe-area-inset-top">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2.5 hover:bg-slate-100 rounded-xl flex-shrink-0 active:bg-slate-200 transition-colors"
              title="Open menu"
              aria-label="Open channel list"
            >
              <Menu className="w-6 h-6 text-slate-600" />
            </button>
            {activeChannel?.type === 'dm' ? (
              <div className="flex items-center gap-2">
                {isEchoAIChannel(activeChannel) ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-bold text-slate-900 truncate text-sm md:text-base">Echo AI</h3>
                    <span className="hidden sm:inline px-2 py-0.5 bg-brand-100 text-brand-700 text-xs rounded-full font-medium">AI Assistant</span>
                  </>
                ) : getDMInfo(activeChannel!).avatar && getDMInfo(activeChannel!).avatar !== 'bot' ? (
                  <>
                    <img src={getDMInfo(activeChannel!).avatar!} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <h3 className="font-bold text-slate-900 truncate text-sm md:text-base">{getDMInfo(activeChannel!).name}</h3>
                  </>
                ) : (
                  <>
                    <UserIcon className="w-5 h-5 text-slate-400" />
                    <h3 className="font-bold text-slate-900 truncate text-sm md:text-base">{getDMInfo(activeChannel!).name}</h3>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <Hash className="w-4 h-4 md:w-5 md:h-5 text-slate-400 flex-shrink-0" />
                <h3 className="font-bold text-slate-900 truncate text-sm md:text-base">{activeChannel?.name}</h3>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {activeChannelId && (
              <button
                onClick={startVideoCall}
                className="p-1.5 md:p-2 hover:bg-green-50 rounded-lg transition-colors group"
                title="Start Video Call"
              >
                <Video className="w-4 h-4 md:w-5 md:h-5 text-slate-400 group-hover:text-green-600" />
              </button>
            )}
            {/* Background Picker */}
            <div className="relative">
              <button
                onClick={() => setShowBackgroundPicker(!showBackgroundPicker)}
                className="p-1.5 md:p-2 hover:bg-purple-50 rounded-lg transition-colors group"
                title="Change Background"
              >
                <Palette className="w-4 h-4 md:w-5 md:h-5 text-slate-400 group-hover:text-purple-600" />
              </button>
              {showBackgroundPicker && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 w-80 max-h-[70vh] overflow-y-auto">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Colors & Patterns</h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {chatBackgrounds.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => handleBackgroundChange(bg.id)}
                        className={`h-12 rounded-lg border-2 transition-all ${bg.style} ${getChannelBackground() === bg.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300'}`}
                        title={bg.name}
                      >
                        <span className="sr-only">{bg.name}</span>
                      </button>
                    ))}
                  </div>

                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Photo Backgrounds</h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {imageBackgrounds.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => handleBackgroundChange(bg.id)}
                        className={`h-16 rounded-lg border-2 transition-all bg-cover bg-center ${getChannelBackground() === bg.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300'}`}
                        style={{ backgroundImage: `url(${bg.url})` }}
                        title={bg.name}
                      >
                        <span className="sr-only">{bg.name}</span>
                      </button>
                    ))}
                  </div>

                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Christmas</h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {christmasBackgrounds.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => handleBackgroundChange(bg.id)}
                        className={`h-16 rounded-lg border-2 transition-all bg-cover bg-center ${getChannelBackground() === bg.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300'}`}
                        style={{ backgroundImage: `url(${bg.url})` }}
                        title={bg.name}
                      >
                        <span className="sr-only">{bg.name}</span>
                      </button>
                    ))}
                  </div>

                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Custom Image</h4>
                  <input
                    type="file"
                    ref={bgInputRef}
                    onChange={handleCustomBgUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    onClick={() => bgInputRef.current?.click()}
                    className={`w-full py-2 px-3 border-2 border-dashed rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${getChannelBackground() === 'custom' ? 'border-brand-500 text-brand-600 bg-brand-50' : 'border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-600'}`}
                  >
                    <ImageIcon className="w-4 h-4" />
                    {getChannelBackground() === 'custom' ? 'Custom image active' : 'Upload your own image'}
                  </button>
                </div>
              )}
            </div>
            {activeChannelId && (
              <button
                onClick={async () => {
                  if (window.confirm("Are you sure you want to delete all messages in this chat? This cannot be undone.")) {
                    try {
                      await clearChatHistory(activeChannelId);
                      setMessages([]);
                      addToast('success', 'Chat history cleared');
                    } catch (error) {
                      addToast('error', 'Failed to clear chat history');
                    }
                  }
                }}
                title="Clear History"
                className="hidden sm:block p-1.5 md:p-2 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 text-slate-300 hover:text-red-500" />
              </button>
            )}
          </div>
        </div>

        <div
          className={`flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 ${getCurrentBackgroundStyle()} bg-cover bg-center bg-fixed`}
          style={getCurrentBackgroundImage() ? { backgroundImage: `url(${getCurrentBackgroundImage()})` } : undefined}
        >
          {/* Load More Messages Button */}
          {hasMoreMessages && (
            <div className="flex justify-center">
              <button
                onClick={loadMoreMessages}
                disabled={loadingMoreMessages}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMoreMessages ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 md:gap-4 group ${msg.isAi ? 'bg-brand-50/30 -mx-3 md:-mx-6 px-3 md:px-6 py-2' : ''}`}>
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.isAi ? 'bg-brand-500' : 'bg-slate-200'}`}>
                {msg.isAi ? (
                  <Bot className="w-4 h-4 md:w-6 md:h-6 text-white" />
                ) : msg.avatar && msg.avatar !== 'user' && msg.avatar.startsWith('http') ? (
                  <img src={msg.avatar} alt="" className="w-full h-full rounded-lg object-cover" />
                ) : (
                  <UserIcon className="w-4 h-4 md:w-6 md:h-6 text-slate-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1 md:gap-2">
                  <span className={`font-bold text-sm md:text-base ${isDarkBackground() ? 'text-white' : 'text-slate-900'}`}>{msg.sender}</span>
                  <span className={`text-[10px] md:text-xs ${isDarkBackground() ? 'text-slate-400' : 'text-slate-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {msg.isEdited && <span className="ml-1 italic">(edited)</span>}
                  </span>
                </div>
                {msg.attachmentUrl && (
                  <div className="mt-1 md:mt-2 mb-1">
                    {msg.attachmentType === 'image' ? (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <img src={msg.attachmentUrl} alt="Attachment" className="max-h-48 md:max-h-60 rounded-lg border border-slate-200" />
                      </a>
                    ) : msg.attachmentType === 'video' ? (
                      <video
                        src={msg.attachmentUrl}
                        controls
                        className="max-h-64 md:max-h-80 rounded-lg border border-slate-200"
                        preload="metadata"
                      />
                    ) : (
                      <a
                        href={msg.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors group"
                      >
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                          <File className="w-5 h-5 text-brand-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate max-w-[200px]">
                            {msg.attachmentName || 'File attachment'}
                          </p>
                          <p className="text-xs text-slate-500">Click to download</p>
                        </div>
                        <Download className="w-4 h-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
                      </a>
                    )}
                  </div>
                )}
                {editingMessageId === msg.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full p-2 text-xs md:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                      rows={3}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleEditMessage(msg.id);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditMessage(msg.id)}
                        className="flex items-center gap-1 px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center gap-1 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm rounded-lg transition-colors"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                      <span className="text-xs text-slate-500 self-center ml-2">
                        Press Enter to save • Esc to cancel
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className={`whitespace-pre-wrap text-sm md:text-base ${isDarkBackground() ? 'text-slate-200' : 'text-slate-700'}`}>{renderTextWithMentions(msg.text)}</span>
                    <span className="inline-flex items-center gap-1 ml-2">
                      {!msg.isAi && msg.senderId === currentUser.id && editingMessageId !== msg.id && (
                        <button
                          onClick={() => {
                            setEditingMessageId(msg.id);
                            setEditingText(msg.text);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand-600 transition-opacity inline-flex items-center align-middle"
                          title="Edit message"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {!msg.isAi && (currentUser.role === 'Owner' || msg.senderId === currentUser.id) && editingMessageId !== msg.id && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id, msg.text)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-opacity inline-flex items-center align-middle"
                          title="Delete message"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </span>
                    {/* Task Link Card */}
                    {msg.taskLink && renderTaskLinkCard(msg.taskLink)}
                  </div>
                )}

                {/* Reactions Display and Picker */}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {(messageReactions[msg.id] || []).map((reaction) => (
                    <button
                      key={reaction.emoji}
                      onClick={() => handleReaction(msg.id, reaction.emoji)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm transition-all ${
                        reaction.userIds.includes(currentUser.id)
                          ? 'bg-brand-100 border-brand-300 border-2'
                          : 'bg-slate-100 border border-slate-300 hover:bg-slate-200'
                      }`}
                      title={`Reacted by ${reaction.count} ${reaction.count === 1 ? 'person' : 'people'}`}
                    >
                      <span>{reaction.emoji}</span>
                      <span className="text-xs font-medium text-slate-600">{reaction.count}</span>
                    </button>
                  ))}

                  {!msg.isAi && (
                    <div className="relative">
                      <button
                        onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-opacity"
                        title="Add reaction"
                      >
                        <SmilePlus className="w-4 h-4" />
                      </button>

                      {showReactionPicker === msg.id && (
                        <div className="absolute left-0 bottom-full mb-2 bg-white rounded-lg shadow-xl border border-slate-200 p-2 z-50 flex gap-1">
                          {['👍', '❤️', '😂', '😮', '😢', '👏', '🎉', '🔥'].map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msg.id, emoji)}
                              className="text-2xl hover:scale-125 transition-transform p-1"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && <div className="text-sm text-slate-400 italic px-6">Echo is typing...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-2 md:p-6 md:pt-2 flex-shrink-0 bg-white border-t border-slate-100">
          <div className="border rounded-lg md:rounded-xl shadow-sm bg-white flex flex-col relative border-slate-300">
            {/* Mention Dropdown */}
            {mentionDropdown?.show && (() => {
              // For private channels, only show members in the dropdown
              const currentCh = channels.find(c => c.id === activeChannelId);
              const isPrivate = currentCh?.is_private;
              const memberIds = isPrivate ? channelMembers.map(m => m.user_id) : null;
              const filteredProfilesForMention = isPrivate
                ? profiles.filter(p => memberIds?.includes(p.id))
                : profiles;

              return (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-[100] animate-fadeIn">
                <div className="p-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase">Mention Someone</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {/* Hide @everyone for private channels - it would leak notifications to non-members */}
                  {!isPrivate && (!mentionDropdown.search || 'everyone'.includes(mentionDropdown.search)) && (
                    <button
                      onClick={() => {
                        const lastAtIndex = message.lastIndexOf('@');
                        const newText = message.substring(0, lastAtIndex) + '@everyone ' + message.substring(mentionDropdown.position);
                        setMessage(newText);
                        setMentionDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-center gap-2 text-sm"
                    >
                      <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs">
                        ALL
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">@everyone</p>
                        <p className="text-xs text-slate-500">Notify all team members</p>
                      </div>
                    </button>
                  )}

                  {filteredProfilesForMention
                    .filter(profile => {
                      if (!mentionDropdown.search) return true;
                      const name = (profile.full_name || '').toLowerCase();
                      return name.includes(mentionDropdown.search);
                    })
                    .map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => {
                          const lastAtIndex = message.lastIndexOf('@');
                          const mentionText = profile.full_name?.split(' ')[0] || 'User';
                          const newText = message.substring(0, lastAtIndex) + '@' + mentionText + ' ' + message.substring(mentionDropdown.position);
                          setMessage(newText);
                          setMentionDropdown(null);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-center gap-2 text-sm"
                      >
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs">
                            {profile.full_name?.charAt(0) || '?'}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-900">{profile.full_name || 'Unknown'}</p>
                          <p className="text-xs text-slate-500">@{profile.full_name?.split(' ')[0] || 'user'}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
              );
            })()}

            <textarea
              value={message}
              onChange={(e) => {
                const value = e.target.value;
                setMessage(value);

                const cursorPos = e.target.selectionStart || 0;
                const textBeforeCursor = value.substring(0, cursorPos);
                const lastAtIndex = textBeforeCursor.lastIndexOf('@');

                if (lastAtIndex !== -1 && cursorPos > lastAtIndex) {
                  const searchText = textBeforeCursor.substring(lastAtIndex + 1);
                  const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
                  if (charBeforeAt === ' ' || lastAtIndex === 0 || charBeforeAt === '\n') {
                    setMentionDropdown({ show: true, search: searchText.toLowerCase(), position: cursorPos });
                  } else {
                    setMentionDropdown(null);
                  }
                } else {
                  setMentionDropdown(null);
                }
              }}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              onPaste={handlePaste}
              placeholder={
                activeChannel?.type === 'dm'
                  ? `Message ${getDMInfo(activeChannel!).name}...`
                  : `Message #${activeChannel?.name}...`
              }
              className="w-full max-h-40 min-h-[44px] md:min-h-[60px] p-2 md:p-3 text-sm md:text-base outline-none resize-none rounded-t-lg md:rounded-t-xl"
            />
            <div className="flex justify-between items-center p-1.5 md:p-2 border-t rounded-b-lg md:rounded-b-xl bg-slate-50 border-slate-100">
              <div className="flex gap-0.5 md:gap-1 relative">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar" />
                <button onClick={() => fileInputRef.current?.click()} className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full text-slate-500" title="Attach file">
                  <Paperclip className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                <button
                  onClick={() => {
                    setShowEmojiPicker(!showEmojiPicker);
                    setShowGifPicker(false);
                  }}
                  className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full text-slate-500"
                >
                  <Smile className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                <button
                  onClick={() => {
                    const isOpening = !showGifPicker;
                    setShowGifPicker(isOpening);
                    setShowEmojiPicker(false);
                    if (isOpening && gifs.length === 0) {
                      searchGifs('');
                    }
                  }}
                  className="hidden sm:block p-1.5 md:p-2 hover:bg-slate-200 rounded-full text-slate-500"
                >
                  <Film className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl border border-slate-200 p-2 md:p-3 z-[100] w-72 md:w-80">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                      <p className="text-sm font-bold text-slate-700">Emojis</p>
                      <button onClick={() => setShowEmojiPicker(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-6 md:grid-cols-8 gap-1 md:gap-2 max-h-64 overflow-y-auto">
                      {['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '👍', '👎', '👏', '🙌', '👋', '🤝', '🙏', '💪', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👊', '✊', '🤛', '🤜', '💯', '🔥', '⚡', '💥', '💫', '⭐', '🌟', '✨', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💘', '💌', '👀', '👁️', '🧠', '🗣️', '👤', '👥', '🫂', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🎮', '🎯', '🎲'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setMessage(message + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-2xl hover:bg-slate-100 rounded p-1 transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* GIF Picker Dropdown */}
                {showGifPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl border border-slate-200 p-2 md:p-3 z-[100] w-80 md:w-96">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                      <p className="text-sm font-bold text-slate-700">GIFs</p>
                      <button onClick={() => setShowGifPicker(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mb-3">
                      <input
                        type="text"
                        placeholder="Search GIFs..."
                        value={gifSearch}
                        onChange={(e) => setGifSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            searchGifs(gifSearch);
                          }
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    {gifLoading ? (
                      <div className="flex justify-center items-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                      </div>
                    ) : gifs.length === 0 ? (
                      <div className="flex justify-center items-center h-64 text-slate-500">
                        No GIFs found. Try searching for something!
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                        {gifs.map((gif: any) => (
                          <button
                            key={gif.id}
                            onClick={async () => {
                              console.log('[GIF] Clicked GIF:', gif.id);
                              const gifUrl = gif.images?.original?.url || gif.images?.downsized?.url;
                              console.log('[GIF] GIF URL:', gifUrl);

                              if (gifUrl) {
                                const newMsg: ChatMessage = {
                                  id: `${Date.now()}_${Math.random()}`,
                                  channelId: activeChannelId,
                                  sender: currentUser.name,
                                  senderId: currentUser.id,
                                  text: 'GIF',
                                  timestamp: new Date().toISOString(),
                                  isAi: false,
                                  avatar: currentUser.avatarUrl || 'user',
                                  attachmentUrl: gifUrl,
                                  attachmentType: 'image'
                                };

                                console.log('[GIF] Sending GIF message:', newMsg);
                                try {
                                  await sendChatMessage(newMsg);
                                  console.log('[GIF] GIF sent successfully');
                                  setShowGifPicker(false);
                                  setGifSearch('');
                                  addToast('success', 'GIF sent!');
                                } catch (error) {
                                  console.error('[GIF] Failed to send GIF:', error);
                                  addToast('error', 'Failed to send GIF');
                                }
                              } else {
                                console.error('[GIF] No GIF URL found');
                                addToast('error', 'Invalid GIF');
                              }
                            }}
                            className="hover:opacity-75 transition-opacity rounded overflow-hidden"
                          >
                            <img
                              src={gif.images?.fixed_height?.url || gif.images?.downsized_small?.url || gif.images?.original?.url}
                              alt={gif.title || 'GIF'}
                              className="w-full h-auto"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={handleSendMessage}
                disabled={loading || (!message.trim() && !isUploading)}
                className="p-1.5 md:p-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Send className="w-4 h-4 md:w-5 md:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Members Management Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1a1d29] rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white text-lg font-semibold">Manage Channel Members</h3>
              <button onClick={() => setShowMembersModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h4 className="text-slate-300 text-sm font-medium mb-2">Current Members</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {channelMembers.map((member: any) => (
                      <div key={member.id} className="flex items-center justify-between bg-[#2d3142] rounded p-2">
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-slate-400" />
                          <span className="text-white text-sm">{member.profiles?.full_name || 'Unknown User'}</span>
                          {member.role === 'owner' && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Owner</span>
                          )}
                        </div>
                        {member.role !== 'owner' && (
                          <button
                            onClick={() => handleRemoveMember(activeChannel?.id || '', member.user_id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-slate-300 text-sm font-medium mb-2">Invite Members</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {profiles
                      .filter(p => !channelMembers.some((m: any) => m.user_id === p.id))
                      .map(profile => (
                        <div key={profile.id} className="flex items-center justify-between bg-[#2d3142] rounded p-2">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-slate-400" />
                            <span className="text-white text-sm">{profile.full_name || profile.email}</span>
                          </div>
                          <button
                            onClick={() => handleInviteUser(activeChannel?.id || '', profile.id)}
                            className="text-green-400 hover:text-green-300"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamChat;
