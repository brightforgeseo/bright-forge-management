import React, { useState, useEffect, useRef } from 'react';
import { Hash, Plus, Trash2, Image as ImageIcon, Send, Bot, User as UserIcon, Loader2, FileText, Users, MessageSquare, RefreshCw, Edit2, X, Check, Smile, Film, SmilePlus, Video, Phone, Lock, UserPlus, Menu } from 'lucide-react';
import { ChatChannel, ChatMessage, User, ToastType, Profile, MessageReaction } from '../types';
import { getChatResponse } from '../services/geminiService';
import { storeEchoConversation, buildConversationContext } from '../services/echoMemory';
import { fetchChatMessages, sendChatMessage, clearChatHistory, uploadFile, fetchChannels, createChannel, deleteChannel, fetchProfiles, getOrCreateDMChannel, createNotification, editChatMessage, fetchMessageReactions, addMessageReaction, removeMessageReaction, fetchChannelMembers, addChannelMember, removeChannelMember, deleteChatMessage } from '../services/databaseService';
import { supabase } from '../lib/supabaseClient';
import DailyIframe from '@daily-co/daily-js';

interface TeamChatProps {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
}

const TeamChat: React.FC<TeamChatProps> = ({ currentUser, addToast }) => {
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

  // Video call state
  const [isInCall, setIsInCall] = useState(false);
  const [callFrame, setCallFrame] = useState<any>(null);
  const callContainerRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChannelRef = useRef<string>('');
  const [mentionDropdown, setMentionDropdown] = useState<{ show: boolean; search: string; position: number } | null>(null);

  // Echo AI Bot User ID (fixed UUID for the bot)
  const ECHO_BOT_ID = '00000000-0000-0000-0000-000000000001';

  // Channel members state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const oscillator3 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator1.frequency.value = 800;
      oscillator2.frequency.value = 1000;
      oscillator3.frequency.value = 1200;

      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      oscillator3.connect(gainNode);
      gainNode.connect(audioContext.destination);

      gainNode.gain.value = 0.8;
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator1.start(audioContext.currentTime);
      oscillator2.start(audioContext.currentTime);
      oscillator3.start(audioContext.currentTime);

      oscillator1.stop(audioContext.currentTime + 0.5);
      oscillator2.stop(audioContext.currentTime + 0.5);
      oscillator3.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  };

  // Search GIFs using Giphy API
  const searchGifs = async (query: string) => {
    if (!query.trim()) {
      query = 'trending';
    }

    console.log('[searchGifs] Searching for:', query);
    setGifLoading(true);
    try {
      const apiKey = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
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

  // Load reactions for all visible messages
  useEffect(() => {
    const loadReactions = async () => {
      const reactionData: Record<string, MessageReaction[]> = {};
      for (const msg of messages) {
        const reactions = await fetchMessageReactions(msg.id);
        if (reactions.length > 0) {
          reactionData[msg.id] = reactions;
        }
      }
      setMessageReactions(reactionData);
    };

    if (messages.length > 0) {
      loadReactions();
    }
  }, [messages]);

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
          isEdited: newMsg.is_edited,
          editedAt: newMsg.edited_at
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
          let targetChannel = channels.find(c => c.id === newMsg.channel_id);

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

          // Show notification
          if (targetChannel && !newMsg.is_ai && newMsg.sender !== currentUser.name) {
            if (targetChannel.type === 'dm') {
              if (isUserInDM(targetChannel, currentUser.id)) {
                addToast('info', `${newMsg.sender}: ${newMsg.text.substring(0, 50)}${newMsg.text.length > 50 ? '...' : ''}`);
              }
            } else {
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
  }, [currentUser.id, currentUser.name, channels]);

  // SIMPLIFIED CHANNEL SWITCH - Always fetch fresh from database
  useEffect(() => {
    if (!activeChannelId) return;

    // Update ref
    activeChannelRef.current = activeChannelId;

    const loadMessages = async () => {
      console.log('[TeamChat] Switching to channel:', activeChannelId);
      console.log('[TeamChat] Fetching fresh messages from database');

      // Clear current messages immediately
      setMessages([]);

      // Fetch fresh from database
      const msgs = await fetchChatMessages(activeChannelId);
      console.log(`[TeamChat] Loaded ${msgs.length} messages from database`);

      setMessages(msgs);
      scrollToBottom();

      // Reset unread count
      setChannels(prev => prev.map(c =>
        c.id === activeChannelId ? { ...c, unread: 0 } : c
      ));
    };

    loadMessages();
  }, [activeChannelId]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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
    // Optimistically update UI first
    const invitedProfile = profiles.find(p => p.id === userId);
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
    } catch (e) {
      console.error('Invite user error:', e);
      addToast('error', `Failed to invite user: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
      await deleteChatMessage(messageId);

      // Remove message from UI
      setMessages(prev => prev.filter(m => m.id !== messageId));

      addToast('success', 'Message deleted');
    } catch (error) {
      console.error('Failed to delete message:', error);
      addToast('error', 'Failed to delete message');
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
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

  // Video/Voice Call Functions
  const startCall = async (videoEnabled: boolean = true) => {
    try {
      const response = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer d4eae6d1fbed74640d5203ffb203db8ed8fc6d7e3ec7d8c22ccf5b6cd4922f2b'
        },
        body: JSON.stringify({
          properties: {
            enable_screenshare: true,
            enable_chat: false,
            start_video_off: !videoEnabled,
            start_audio_off: false
          }
        })
      });

      const room = await response.json();
      const roomUrl = room.url;

      const callMsg: ChatMessage = {
        id: Date.now().toString(),
        channelId: activeChannelId,
        sender: currentUser.name,
        senderId: currentUser.id,
        text: `${videoEnabled ? '📹' : '📞'} Started a ${videoEnabled ? 'video' : 'voice'} call: ${roomUrl}`,
        timestamp: new Date().toISOString(),
        avatar: currentUser.avatarUrl || 'user'
      };
      await sendChatMessage(callMsg);

      joinCall(roomUrl, videoEnabled);
      addToast('success', `${videoEnabled ? 'Video' : 'Voice'} call started!`);
    } catch (error) {
      console.error('Error starting call:', error);
      addToast('error', 'Failed to start call');
    }
  };

  const joinCall = (roomUrl: string, videoEnabled: boolean = true) => {
    if (!callContainerRef.current) return;

    const frame = DailyIframe.createFrame(callContainerRef.current, {
      showLeaveButton: true,
      iframeStyle: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        zIndex: '9999',
        border: 'none'
      }
    });

    frame.join({
      url: roomUrl,
      userName: currentUser.name,
      startVideoOff: !videoEnabled
    });

    frame.on('left-meeting', () => {
      frame.destroy();
      setCallFrame(null);
      setIsInCall(false);
    });

    setCallFrame(frame);
    setIsInCall(true);
  };

  const endCall = () => {
    if (callFrame) {
      callFrame.leave();
      callFrame.destroy();
      setCallFrame(null);
      setIsInCall(false);
    }
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
        isEdited: result.is_edited,
        editedAt: result.edited_at
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
      addToast('error', `Failed to send message: ${error.message || 'Unknown error'}`);
      setMessage(messageText); // Restore message on error
      return;
    }

    // Create Notification if DM
    if (currentCh?.type === 'dm') {
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
        playNotificationSound();
      }
    }

    // Create notifications for @mentions
    if (currentCh?.type === 'channel' && mentions.length > 0) {
      for (const mentionedId of mentions) {
        if (mentionedId !== currentUser.id) {
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
      playNotificationSound();
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

        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          channelId: activeChannelId,
          sender: 'Echo AI',
          senderId: ECHO_BOT_ID, // Use Echo bot ID
          text: response,
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        };

        await sendChatMessage(aiMsg);

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
        addToast('error', 'AI unavailable');
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
                await createNotification(otherId, 'New Attachment', `${currentUser.name} sent an image`, 'message', 'TEAM_CHAT');
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
      const type = e.target.files[0].type.startsWith('image/') ? 'image' : 'file';
      await sendChatMessage({
        id: Date.now().toString(),
        channelId: activeChannelId,
        sender: currentUser.name,
        senderId: currentUser.id,
        text: type === 'image' ? 'Sent an image' : `Sent file: ${e.target.files[0].name}`,
        timestamp: new Date().toISOString(),
        avatar: currentUser.avatarUrl || 'user',
        attachmentUrl: url,
        attachmentType: type
      });

      const currentCh = channels.find(c => c.id === activeChannelId);
      if (currentCh?.type === 'dm') {
        const ids = parseDMChannel(currentCh.name);
        const otherId = ids.find(id => id !== currentUser.id);
        if (otherId && otherId !== currentUser.id) {
          await createNotification(otherId, 'New Attachment', `${currentUser.name} sent an attachment`, 'message', 'TEAM_CHAT');
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
        w-64 bg-[#3F0E40] flex flex-col flex-shrink-0
        fixed md:relative inset-y-0 left-0 z-50
        transform transition-transform duration-300 ease-in-out
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="h-12 px-4 flex items-center justify-between border-b border-[#5d2c5d]">
          <h2 className="font-bold text-white truncate">Bright Forge</h2>
          <div className="flex items-center gap-2">
            {currentUser.role === 'Owner' && (
              <button onClick={() => setShowCreateChannel(true)} className="text-slate-300 hover:text-white" title="New Channel">
                <Plus className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden text-slate-300 hover:text-white"
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

        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-6">
          {/* AI Assistant Section */}
          <div>
            <div className="px-4 flex items-center justify-between group text-[#bcabbc] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">AI Assistant</span>
            </div>
            <ul>
              {echoAIChannel ? (
                <li
                  key={echoAIChannel.id}
                  onClick={() => setActiveChannelId(echoAIChannel.id)}
                  className={`px-4 py-1 flex items-center justify-between cursor-pointer mx-2 rounded-md group ${activeChannelId === echoAIChannel.id ? 'bg-[#1164A3] text-white' : 'text-[#bcabbc] hover:bg-[#350d36]'}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Bot className="w-4 h-4 text-brand-400" />
                    <span className={`truncate ${echoAIChannel.unread ? 'font-bold text-white' : ''}`}>
                      Echo AI {echoAIChannel.unread ? `(${echoAIChannel.unread})` : ''}
                    </span>
                  </div>
                </li>
              ) : (
                <li
                  onClick={handleStartEchoAI}
                  className="px-4 py-1 flex items-center gap-2 mx-2 rounded-md text-[#bcabbc] hover:bg-[#350d36] cursor-pointer"
                >
                  <Bot className="w-4 h-4 text-brand-400" />
                  <span className="truncate">Start Echo AI Chat</span>
                </li>
              )}
            </ul>
          </div>

          {/* Public Channels */}
          <div>
            <div className="px-4 flex items-center justify-between group text-[#bcabbc] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Channels</span>
            </div>
            <ul>
              {publicChannels.map(channel => (
                <li
                  key={channel.id}
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`px-4 py-1 flex items-center justify-between cursor-pointer mx-2 rounded-md group ${activeChannelId === channel.id ? 'bg-[#1164A3] text-white' : 'text-[#bcabbc] hover:bg-[#350d36]'}`}
                >
                  <div className="flex items-center truncate">
                    {channel.is_private ? (
                      <Lock className="w-4 h-4 mr-2 opacity-70" />
                    ) : (
                      <Hash className="w-4 h-4 mr-2 opacity-70" />
                    )}
                    <span className={`truncate ${channel.unread ? 'font-bold text-white' : ''}`}>
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
            <div className="px-4 flex items-center justify-between group text-[#bcabbc] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Direct Messages</span>
              <button onClick={refreshData} title="Refresh List" className={`${isRefreshing ? 'animate-spin' : ''} hover:text-white`}>
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <ul>
              {dmChannels.map(channel => {
                const { name, avatar, isOnline } = getDMInfo(channel);
                return (
                  <li
                    key={channel.id}
                    className={`px-4 py-1 flex items-center gap-2 mx-2 rounded-md group ${activeChannelId === channel.id ? 'bg-[#1164A3] text-white' : 'text-[#bcabbc] hover:bg-[#350d36]'}`}
                  >
                    <div
                      className="relative w-4 h-4 flex-shrink-0 cursor-pointer"
                      onClick={() => setActiveChannelId(channel.id)}
                    >
                      {avatar ? (
                        <img src={avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center text-[8px] text-white font-bold">
                          {name.charAt(0)}
                        </div>
                      )}
                      {channel.unread ? (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-[#3F0E40]" title="Unread messages"></div>
                      ) : isOnline ? (
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-[#3F0E40]" title="Online"></div>
                      ) : null}
                    </div>
                    <span
                      className={`truncate text-sm flex-1 cursor-pointer ${channel.unread ? 'font-bold text-white' : ''}`}
                      onClick={() => setActiveChannelId(channel.id)}
                    >
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
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 flex-shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                );
              })}
              {dmChannels.length === 0 && <li className="px-4 text-xs text-slate-500 italic">No active chats</li>}
            </ul>
          </div>

          {/* All Team Members */}
          <div>
            <div className="px-4 flex items-center justify-between group text-[#bcabbc] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Team</span>
              <Users className="w-3 h-3" />
            </div>
            <ul>
              {profiles.map(p => (
                <li
                  key={p.id}
                  onClick={() => handleStartDM(p.id)}
                  className="px-4 py-1 flex items-center gap-2 mx-2 text-[#bcabbc] hover:bg-[#350d36] rounded-md cursor-pointer transition-colors"
                >
                  <div className="relative">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-slate-500 flex items-center justify-center text-[8px] text-white font-bold">
                        {p.full_name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#3F0E40] ${
                        p.isOnline ? 'bg-green-500' : 'bg-slate-400'
                      }`}
                      title={p.isOnline ? 'Online' : 'Offline'}
                    />
                  </div>
                  <span className="truncate text-sm flex-1">
                    {p.full_name || p.email?.split('@')[0] || 'Team Member'}
                    {p.id === currentUser.id && ' (You)'}
                  </span>
                  {p.isOnline && p.id !== currentUser.id && (
                    <span className="text-[10px] text-green-400 font-medium">●</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-white h-full">
        <div className="h-14 md:h-16 border-b border-slate-200 flex items-center justify-between px-3 md:px-6 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg flex-shrink-0"
              title="Open menu"
            >
              <Menu className="w-5 h-5 text-slate-600" />
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
              <>
                <button
                  onClick={() => startCall(true)}
                  className="p-1.5 md:p-2 hover:bg-green-50 rounded-lg transition-colors group"
                  title="Start Video Call"
                >
                  <Video className="w-4 h-4 md:w-5 md:h-5 text-slate-400 group-hover:text-green-600" />
                </button>
                <button
                  onClick={() => startCall(false)}
                  className="hidden sm:block p-1.5 md:p-2 hover:bg-blue-50 rounded-lg transition-colors group"
                  title="Start Voice Call"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5 text-slate-400 group-hover:text-blue-600" />
                </button>
              </>
            )}
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

        <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">
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
                  <span className="font-bold text-slate-900 text-sm md:text-base">{msg.sender}</span>
                  <span className="text-[10px] md:text-xs text-slate-400">
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
                    ) : (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-brand-600 underline text-sm">
                        <FileText className="w-4 h-4" /> Attachment
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
                    <span className="text-slate-700 whitespace-pre-wrap text-sm md:text-base">{msg.text}</span>
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
            {mentionDropdown?.show && (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-[100] animate-fadeIn">
                <div className="p-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase">Mention Someone</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {(!mentionDropdown.search || 'everyone'.includes(mentionDropdown.search)) && (
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

                  {profiles
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
            )}

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
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full text-slate-500">
                  <ImageIcon className="w-4 h-4 md:w-5 md:h-5" />
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

      {/* Video Call Container */}
      <div ref={callContainerRef} />

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
