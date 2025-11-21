import React, { useState, useEffect, useRef } from 'react';
import { Hash, Plus, Trash2, Image as ImageIcon, Send, Bot, User as UserIcon, Loader2, FileText, Users, MessageSquare, RefreshCw, Edit2, X, Check, Smile, Film, SmilePlus, Video, Phone } from 'lucide-react';
import { ChatChannel, ChatMessage, User, ToastType, Profile, MessageReaction } from '../types';
import { getChatResponse } from '../services/geminiService';
import { fetchChatMessages, sendChatMessage, clearChatHistory, uploadFile, fetchChannels, createChannel, deleteChannel, fetchProfiles, getOrCreateDMChannel, createNotification, editChatMessage, fetchMessageReactions, addMessageReaction, removeMessageReaction } from '../services/databaseService';
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

    setGifLoading(true);
    try {
      const apiKey = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
      const limit = 20;
      const endpoint = query === 'trending'
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}`
        : `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=${limit}`;

      const response = await fetch(endpoint);
      const data = await response.json();
      setGifs(data.data || []);
    } catch (error) {
      console.error('Error fetching GIFs:', error);
      setGifs([]);
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
      if (chans.length > 0 && !activeChannelId) {
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
    const msgSub = supabase.channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const newMsg = payload.new as any;
        console.log('[TeamChat] New message received:', newMsg.id);

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
      .subscribe();

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
      const newCh = await createChannel(newChannelName, 'channel');
      setNewChannelName('');
      setShowCreateChannel(false);
      if (newCh) {
        setChannels(prev => [...prev, newCh]);
        setActiveChannelId(newCh.id);
      }
      addToast('success', 'Channel created');
    } catch (e) {
      addToast('error', 'Failed to create channel (Name might be taken)');
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

  const handleEditMessage = async (messageId: string) => {
    if (!editingText.trim()) return;

    await editChatMessage(messageId, editingText);

    setMessages(prev => prev.map(m =>
      m.id === messageId
        ? { ...m, text: editingText, isEdited: true, editedAt: new Date().toISOString() }
        : m
    ));

    setEditingMessageId(null);
    setEditingText('');
    addToast('success', 'Message updated');
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
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
        zIndex: 9999,
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
    if (!message.trim()) return;
    const currentCh = channels.find(c => c.id === activeChannelId);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      channelId: activeChannelId,
      sender: currentUser.name,
      senderId: currentUser.id,
      text: message,
      timestamp: new Date().toISOString(),
      avatar: currentUser.avatarUrl || 'user'
    };

    const mentions = detectMentions(message.trim());
    setMessage('');
    setMentionDropdown(null);

    // Send to database - realtime listener will add it to UI
    await sendChatMessage(userMsg);

    // Create Notification if DM
    if (currentCh?.type === 'dm') {
      const ids = parseDMChannel(currentCh.name);
      const otherId = ids.find(id => id !== currentUser.id);
      if (otherId && otherId !== currentUser.id) {
        await createNotification(
          otherId,
          'New Message',
          `${currentUser.name}: ${userMsg.text.substring(0, 100)}`,
          'message',
          'TEAM_CHAT'
        );
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
            'TEAM_CHAT'
          );
        }
      }
      playNotificationSound();
    }

    // AI Response
    if (currentCh?.name === 'ask-ai') {
      setLoading(true);
      try {
        const history = messages.slice(-10).map(m => `${m.sender}: ${m.text}`).join('\n');
        const response = await getChatResponse(history, userMsg.text);

        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          channelId: activeChannelId,
          sender: 'NexusBot',
          senderId: 'ai-bot',
          text: response,
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        };

        await sendChatMessage(aiMsg);
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
  const publicChannels = channels.filter(c => c.type !== 'dm');
  const dmChannels = channels.filter(c => isUserInDM(c, currentUser.id));

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Channels Sidebar */}
      <div className="w-64 bg-[#3F0E40] flex flex-col flex-shrink-0">
        <div className="h-12 px-4 flex items-center justify-between border-b border-[#5d2c5d]">
          <h2 className="font-bold text-white truncate">Bright Forge</h2>
          {currentUser.role === 'Owner' && (
            <button onClick={() => setShowCreateChannel(true)} className="text-slate-300 hover:text-white" title="New Channel">
              <Plus className="w-5 h-5" />
            </button>
          )}
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
            <div className="flex gap-1">
              <button onClick={handleCreateChannel} className="flex-1 bg-green-600 text-white text-[10px] py-0.5 rounded">Create</button>
              <button onClick={() => setShowCreateChannel(false)} className="flex-1 bg-slate-600 text-white text-[10px] py-0.5 rounded">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-6">
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
                    <Hash className="w-4 h-4 mr-2 opacity-70" />
                    <span className={`truncate ${channel.unread ? 'font-bold text-white' : ''}`}>
                      {channel.name} {channel.unread ? `(${channel.unread})` : ''}
                    </span>
                  </div>
                  {currentUser.role === 'Owner' && channel.name !== 'ask-ai' && (
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
        <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2">
            {activeChannel?.type === 'dm' ? (
              <div className="flex items-center gap-2">
                {getDMInfo(activeChannel!).avatar ? (
                  <img src={getDMInfo(activeChannel!).avatar!} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <UserIcon className="w-5 h-5 text-slate-400" />
                )}
                <h3 className="font-bold text-slate-900 truncate">{getDMInfo(activeChannel!).name}</h3>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-slate-400" />
                <h3 className="font-bold text-slate-900 truncate">{activeChannel?.name}</h3>
                {activeChannel?.name === 'ask-ai' && (
                  <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs rounded-full font-medium">AI</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeChannelId && (
              <>
                <button
                  onClick={() => startCall(true)}
                  className="p-2 hover:bg-green-50 rounded-lg transition-colors group"
                  title="Start Video Call"
                >
                  <Video className="w-5 h-5 text-slate-400 group-hover:text-green-600" />
                </button>
                <button
                  onClick={() => startCall(false)}
                  className="p-2 hover:bg-blue-50 rounded-lg transition-colors group"
                  title="Start Voice Call"
                >
                  <Phone className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
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
              >
                <Trash2 className="w-4 h-4 text-slate-300 hover:text-red-500" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 group ${msg.isAi ? 'bg-brand-50/30 -mx-6 px-6 py-2' : ''}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.isAi ? 'bg-brand-500' : 'bg-slate-200'}`}>
                {msg.isAi ? (
                  <Bot className="w-6 h-6 text-white" />
                ) : msg.avatar && msg.avatar !== 'user' && msg.avatar.startsWith('http') ? (
                  <img src={msg.avatar} alt="" className="w-full h-full rounded-lg object-cover" />
                ) : (
                  <UserIcon className="w-6 h-6 text-slate-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-slate-900">{msg.sender}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {msg.isEdited && <span className="ml-1 italic">(edited)</span>}
                  </span>
                </div>
                {msg.attachmentUrl && (
                  <div className="mt-2 mb-1">
                    {msg.attachmentType === 'image' ? (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <img src={msg.attachmentUrl} alt="Attachment" className="max-h-60 rounded-lg border border-slate-200" />
                      </a>
                    ) : (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-brand-600 underline">
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
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none resize-none"
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
                    <span className="text-slate-700 whitespace-pre-wrap">{msg.text}</span>
                    {!msg.isAi && msg.senderId === currentUser.id && editingMessageId !== msg.id && (
                      <button
                        onClick={() => {
                          setEditingMessageId(msg.id);
                          setEditingText(msg.text);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand-600 transition-opacity inline-flex items-center ml-2 align-middle"
                        title="Edit message"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
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
          {loading && <div className="text-sm text-slate-400 italic px-6">NexusBot is typing...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-6 pt-2 flex-shrink-0 bg-white border-t border-slate-100">
          <div className="border rounded-xl shadow-sm bg-white flex flex-col relative border-slate-300">
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
                  ? `Message ${getDMInfo(activeChannel!).name}... (Use @name or @everyone to mention)`
                  : `Message #${activeChannel?.name}... (Use @name or @everyone to mention)`
              }
              className="w-full max-h-40 min-h-[60px] p-3 outline-none resize-none rounded-t-xl"
            />
            <div className="flex justify-between items-center p-2 border-t rounded-b-xl bg-slate-50 border-slate-100">
              <div className="flex gap-1 relative">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                  <ImageIcon className="w-5 h-5" />
                </button>

                <button
                  onClick={() => {
                    setShowEmojiPicker(!showEmojiPicker);
                    setShowGifPicker(false);
                  }}
                  className="p-2 hover:bg-slate-200 rounded-full text-slate-500"
                >
                  <Smile className="w-5 h-5" />
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
                  className="p-2 hover:bg-slate-200 rounded-full text-slate-500"
                >
                  <Film className="w-5 h-5" />
                </button>

                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl border border-slate-200 p-3 z-[100] w-80">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                      <p className="text-sm font-bold text-slate-700">Emojis</p>
                      <button onClick={() => setShowEmojiPicker(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-8 gap-2 max-h-64 overflow-y-auto">
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
                  <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl border border-slate-200 p-3 z-[100] w-96">
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
                              const gifUrl = gif.images?.original?.url || gif.images?.downsized?.url;
                              if (gifUrl) {
                                const newMsg: ChatMessage = {
                                  id: `${Date.now()}_${Math.random()}`,
                                  channelId: activeChannelId,
                                  sender: currentUser.name,
                                  senderId: currentUser.id,
                                  text: '',
                                  timestamp: new Date().toISOString(),
                                  isAi: false,
                                  avatar: currentUser.avatarUrl || 'user',
                                  attachmentUrl: gifUrl,
                                  attachmentType: 'image'
                                };
                                await sendChatMessage(newMsg);
                                setShowGifPicker(false);
                                setGifSearch('');
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
                className="p-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Video Call Container */}
      <div ref={callContainerRef} />
    </div>
  );
};

export default TeamChat;
