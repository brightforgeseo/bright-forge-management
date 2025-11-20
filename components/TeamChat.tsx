import React, { useState, useEffect, useRef } from 'react';
import { Hash, Plus, Trash2, Image as ImageIcon, Send, Bot, User as UserIcon, Loader2, FileText, Users, MessageSquare, RefreshCw, Edit2, X, Check } from 'lucide-react';
import { ChatChannel, ChatMessage, User, ToastType, Profile } from '../types';
import { getChatResponse } from '../services/geminiService';
import { fetchChatMessages, sendChatMessage, clearChatHistory, uploadFile, fetchChannels, createChannel, deleteChannel, fetchProfiles, getOrCreateDMChannel, createNotification, editChatMessage } from '../services/databaseService';
import { supabase } from '../lib/supabaseClient';

interface TeamChatProps {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
}

const TeamChat: React.FC<TeamChatProps> = ({ currentUser, addToast }) => {
  
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Store message drafts for each channel
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});

  // Cache messages for each channel to prevent losing messages when switching
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({});

  // Message editing state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChannelRef = useRef<string>('');
  const previousChannelRef = useRef<string>('');
  const channelsRef = useRef<ChatChannel[]>([]);
  const profilesRef = useRef<Profile[]>([]);
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

      // Check if text mentions this person
      if (text.toLowerCase().includes(`@${firstName}`) || text.toLowerCase().includes(`@${fullName}`)) {
        mentionedIds.push(profile.id);
      }
    });

    return mentionedIds;
  };

  // Play notification sound - LOUD bell sound
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

      console.log('🔔 Notification sound played!');
    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  };

  // Sync Refs for listeners to avoid dependency loops
  useEffect(() => {
      channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
      profilesRef.current = profiles;
  }, [profiles]);

  // Presence Tracking - Track who's online
  useEffect(() => {
    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    // Subscribe to presence changes
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        console.log('[Presence] Online users:', state);

        // Update profiles with online status
        setProfiles(prev => prev.map(profile => {
          const isOnline = Object.keys(state).includes(profile.id);
          return { ...profile, isOnline };
        }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Presence] Connected, tracking online status');
          // Broadcast your presence
          await presenceChannel.track({
            user: currentUser.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    // Heartbeat to keep presence alive
    const heartbeat = setInterval(() => {
      presenceChannel.track({
        user: currentUser.id,
        online_at: new Date().toISOString(),
      });
    }, 30000); // Update every 30 seconds

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
          // Self-DM or malformed
          return { name: 'You', avatar: currentUser.avatarUrl, isOnline: false };
      }

      const prof = profiles.find(p => p.id === otherId);

      // Better fallback: show email prefix or first 8 chars of ID
      let displayName = 'Loading...';
      if (prof) {
          displayName = prof.full_name || prof.email?.split('@')[0] || `User ${otherId.substring(0, 8)}`;
      } else if (profiles.length > 0) {
          // Profiles loaded but this user not found - show partial ID
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

  // Message Listener with improved DM handling
  useEffect(() => {
    console.log('[TeamChat] Setting up realtime subscription');
    const msgSub = supabase.channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
         const newMsg = payload.new as any;
         console.log('[TeamChat] Realtime message received:', newMsg);

         // Always update cache for ALL incoming messages (regardless of channel)
         setMessageCache(prev => {
             const channelMessages = prev[newMsg.channel_id] || [];
             // Prevent duplicates
             if (!channelMessages.some(m => m.id === newMsg.id)) {
                 return {
                     ...prev,
                     [newMsg.channel_id]: [...channelMessages, {
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
                     }]
                 };
             }
             return prev;
         });

         // Check if this message is for the currently active channel
         if (newMsg.channel_id === activeChannelRef.current) {
             // Update the messages state for current channel
             setMessages(prev => {
                 if (!prev.some(m => m.id === newMsg.id)) {
                     console.log(`[TeamChat] Adding message to UI. Current count: ${prev.length}, New message:`, newMsg.text);
                     return [...prev, {
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
                     }];
                 }
                 console.log(`[TeamChat] Message already exists, not adding. ID: ${newMsg.id}`);
                 return prev;
             });
             scrollToBottom();
         } else {
             // Message is for a different channel - handle notifications
             console.log('[TeamChat] Message is for different channel, looking up channel');
             let targetChannel = channelsRef.current.find(c => c.id === newMsg.channel_id);
             console.log('[TeamChat] Target channel:', targetChannel);

             // CRITICAL FIX: If we don't know about this channel, fetch all channels
             if (!targetChannel) {
                 console.log('[TeamChat] Channel not found locally, fetching from database...');
                 const updatedChannels = await fetchChannels();
                 targetChannel = updatedChannels.find(c => c.id === newMsg.channel_id);
                 console.log('[TeamChat] Fetched channels, target channel:', targetChannel);

                 // Update channels state with the new DM channel and increment unread count
                 setChannels(updatedChannels.map(c =>
                     c.id === newMsg.channel_id ? { ...c, unread: 1 } : c
                 ));
             } else {
                 // Channel exists, just update unread count
                 setChannels(prev => prev.map(c =>
                     c.id === targetChannel?.id ? { ...c, unread: (c.unread || 0) + 1 } : c
                 ));
             }

             // Notify appropriately
             if (targetChannel && !newMsg.is_ai && newMsg.sender !== currentUser.name) {
                 // Privacy check: For DMs, only notify if I'm a participant
                 if (targetChannel.type === 'dm') {
                     if (!isUserInDM(targetChannel, currentUser.id)) {
                         return; // Not my DM, ignore
                     }

                     // Get sender info for notification
                     const dmInfo = getDMInfo(targetChannel);
                     addToast('info', `${newMsg.sender}: ${newMsg.text.substring(0, 50)}${newMsg.text.length > 50 ? '...' : ''}`);
                 } else {
                     // Public channel notification
                     addToast('info', `New message in #${targetChannel.name}`);
                 }
             }
         }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, async (payload) => {
         const updatedMsg = payload.new as any;
         console.log('[TeamChat] Realtime message UPDATE received:', updatedMsg);

         // Update in cache
         setMessageCache(prev => {
             const channelMessages = prev[updatedMsg.channel_id] || [];
             return {
                 ...prev,
                 [updatedMsg.channel_id]: channelMessages.map(m =>
                     m.id === updatedMsg.id ? {
                         ...m,
                         text: updatedMsg.text,
                         isEdited: updatedMsg.is_edited,
                         editedAt: updatedMsg.edited_at
                     } : m
                 )
             };
         });

         // Update in current messages if this is the active channel
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

    return () => { supabase.removeChannel(msgSub); };
  }, [currentUser.id, currentUser.name]);

  // Active Channel Switch
  useEffect(() => {
    if (!activeChannelId) return;

    // Prevent loading the same channel multiple times
    if (activeChannelRef.current === activeChannelId) {
      console.log('[TeamChat] Already on this channel, skipping load');
      return;
    }

    // Save current messages to cache before switching (using the previous channel ID)
    if (previousChannelRef.current && messages.length > 0) {
      setMessageCache(prev => ({ ...prev, [previousChannelRef.current]: messages }));
      console.log(`[TeamChat] Saved ${messages.length} messages to cache for channel:`, previousChannelRef.current);
    }

    // Update refs for the new channel
    activeChannelRef.current = activeChannelId;
    previousChannelRef.current = activeChannelId;

    const loadMsgs = async () => {
      // Check if we have cached messages for this channel
      if (messageCache[activeChannelId] && messageCache[activeChannelId].length > 0) {
        console.log(`[TeamChat] Loading ${messageCache[activeChannelId].length} messages from cache for channel:`, activeChannelId);
        setMessages(messageCache[activeChannelId]);
        // Don't fetch in background - realtime keeps cache updated
      } else {
        // No cache, fetch from database
        console.log('[TeamChat] No cache found, fetching from database for channel:', activeChannelId);
        const msgs = await fetchChatMessages(activeChannelId);
        console.log(`[TeamChat] Fetched ${msgs.length} messages from database for channel:`, activeChannelId);
        setMessages(msgs);
        setMessageCache(prev => ({ ...prev, [activeChannelId]: msgs }));
      }

      scrollToBottom();
      // Reset unread
      setChannels(prev => prev.map(c => c.id === activeChannelId ? { ...c, unread: 0 } : c));
    };
    loadMsgs();
  }, [activeChannelId]);

  const scrollToBottom = () => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

  const handleCreateChannel = async () => {
      if (!newChannelName.trim()) return;
      try {
          const newCh = await createChannel(newChannelName, 'channel');
          setNewChannelName('');
          setShowCreateChannel(false);
          if(newCh) {
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
          // Delete from database
          await deleteChannel(id);

          // Immediately remove from local state
          setChannels(prev => prev.filter(c => c.id !== id));

          // If we deleted the active channel, switch to general or first available
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

  // Direct Messaging - Improved with retry logic
  const handleStartDM = async (targetProfileId: string) => {
      console.log('[TeamChat] ========== STARTING DM ==========');
      console.log('[TeamChat] Target user ID:', targetProfileId);
      console.log('[TeamChat] Current user ID:', currentUser.id);
      console.log('[TeamChat] Current user email:', currentUser.email);
      console.log('[TeamChat] Current user name:', currentUser.name);

      try {
          // Don't allow DM with yourself
          if (targetProfileId === currentUser.id) {
              console.log('[TeamChat] ERROR: Trying to DM yourself');
              addToast('info', 'Cannot message yourself!');
              return;
          }

          // Create or get DM channel
          console.log('[TeamChat] Calling getOrCreateDMChannel...');
          console.log('[TeamChat] Parameters: user1=' + currentUser.id + ', user2=' + targetProfileId);

          const dmChannel = await getOrCreateDMChannel(currentUser.id, targetProfileId);

          console.log('[TeamChat] DM Channel result:', JSON.stringify(dmChannel, null, 2));

          if (!dmChannel || !dmChannel.id) {
              throw new Error('DM channel creation returned null or invalid channel');
          }

          // Ensure it's in our local state
          setChannels(prev => {
              if (prev.find(c => c.id === dmChannel.id)) {
                  console.log('[TeamChat] DM channel already in state');
                  return prev;
              }
              console.log('[TeamChat] Adding DM channel to state');
              return [...prev, dmChannel];
          });

          // Switch to it
          console.log('[TeamChat] Switching to DM channel:', dmChannel.id);
          setActiveChannelId(dmChannel.id);
          addToast('success', 'DM conversation opened!');
          console.log('[TeamChat] ========== DM OPENED SUCCESSFULLY ==========');
      } catch (e: any) {
          console.error('[TeamChat] ========== DM ERROR ==========');
          console.error('[TeamChat] Error type:', e?.constructor?.name);
          console.error('[TeamChat] Error message:', e?.message);
          console.error('[TeamChat] Full error:', e);
          console.error('[TeamChat] Stack:', e?.stack);
          addToast('error', 'Could not start DM: ' + (e?.message || 'Unknown error'));
      }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingText.trim()) return;

    await editChatMessage(messageId, editingText);

    // Update local state
    setMessages(prev => prev.map(m =>
      m.id === messageId
        ? { ...m, text: editingText, isEdited: true, editedAt: new Date().toISOString() }
        : m
    ));

    // Update cache
    setMessageCache(prev => ({
      ...prev,
      [activeChannelId]: prev[activeChannelId]?.map(m =>
        m.id === messageId
          ? { ...m, text: editingText, isEdited: true, editedAt: new Date().toISOString() }
          : m
      ) || []
    }));

    setEditingMessageId(null);
    setEditingText('');
    addToast('success', 'Message updated');
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

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

    // Detect @mentions
    const mentions = detectMentions(message.trim());
    console.log('💬 Team Chat message:', message);
    console.log('👥 Detected mentions:', mentions);

    setMessage('');
    // Also clear the draft for this channel since message was sent
    setMessageDrafts(prev => {
      const newDrafts = { ...prev };
      delete newDrafts[activeChannelId];
      return newDrafts;
    });
    setMentionDropdown(null); // Close dropdown

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

    // Create notifications for @mentions in channels
    if (currentCh?.type === 'channel' && mentions.length > 0) {
        console.log('📢 Creating notifications for', mentions.length, 'mentioned users');
        for (const mentionedId of mentions) {
            if (mentionedId !== currentUser.id) { // Don't notify self
                console.log('✉️ Notifying user:', mentionedId);
                await createNotification(
                    mentionedId,
                    `${currentUser.name} mentioned you in #${currentCh.name}`,
                    userMsg.text.substring(0, 100),
                    'message',
                    'TEAM_CHAT'
                );
            }
        }
        console.log('🔔 Playing notification sound');
        playNotificationSound();
    }

    // AI Response
    if (currentCh?.name === 'ask-ai') {
      setLoading(true);
      try {
        const history = messages.slice(-10).map(m => `${m.sender}: ${m.text}`).join('\n');
        const response = await getChatResponse(history, userMsg.text);
        
        await sendChatMessage({
          id: (Date.now() + 1).toString(),
          channelId: activeChannelId,
          sender: 'NexusBot',
          text: response,
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        });
      } catch (err) {
        addToast('error', 'AI unavailable');
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items;

      // Check if pasting an image
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
              // Only prevent default and handle specially for images
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

                      // Notify DM participant
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
              return; // Exit after handling image
          }
      }

      // For text paste: manually handle to prevent any auto-send behavior
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      const textarea = e.currentTarget;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const currentValue = textarea.value;

      // Insert pasted text at cursor position
      const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
      setMessage(newValue);

      // Set cursor position after pasted text
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
         text: type === 'image' ? 'Sent an image' : `Sent file: ${e.target.files[0].name}`,
         timestamp: new Date().toISOString(),
         avatar: currentUser.avatarUrl || 'user',
         attachmentUrl: url,
         attachmentType: type
       });
       
        // Notify DM participant
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
  
  // Determine if the current channel is Read-Only
  // Everyone can post in all channels (removed role restriction)
  const isChannelReadOnly = false;
  
  // Filter Lists with robust UUID matching
  const publicChannels = channels.filter(c => c.type !== 'dm');
  const dmChannels = channels.filter(c => isUserInDM(c, currentUser.id));

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Channels Sidebar */}
      <div className="w-64 bg-[#3F0E40] flex flex-col flex-shrink-0">
        <div className="h-12 px-4 flex items-center justify-between border-b border-[#5d2c5d]">
          <h2 className="font-bold text-white truncate">Bright Forge</h2>
          {currentUser.role === 'Owner' && (
            <button onClick={() => setShowCreateChannel(true)} className="text-slate-300 hover:text-white" title="New Channel"><Plus className="w-5 h-5" /></button>
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
                  onClick={() => {
                    // Save current message as draft for current channel
                    if (activeChannelId && message) {
                      setMessageDrafts(prev => ({ ...prev, [activeChannelId]: message }));
                    }
                    // Switch to new channel
                    setActiveChannelId(channel.id);
                    // Restore draft for new channel (if any)
                    setMessage(messageDrafts[channel.id] || '');
                  }}
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
                    <button onClick={refreshData} title="Refresh List" className={`${isRefreshing ? 'animate-spin' : ''} hover:text-white`}><RefreshCw className="w-3 h-3" /></button>
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
                                    onClick={() => {
                                      // Save current message as draft for current channel
                                      if (activeChannelId && message) {
                                        setMessageDrafts(prev => ({ ...prev, [activeChannelId]: message }));
                                      }
                                      // Switch to new channel
                                      setActiveChannelId(channel.id);
                                      // Restore draft for new channel (if any)
                                      setMessage(messageDrafts[channel.id] || '');
                                    }}
                                >
                                    {avatar ? <img src={avatar} alt="" className="w-4 h-4 rounded-full object-cover" /> : <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center text-[8px] text-white font-bold">{name.charAt(0)}</div>}
                                    {/* Online status indicator (green) or Unread indicator (red) */}
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
                        {/* Online status indicator */}
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
                    {getDMInfo(activeChannel!).avatar ? <img src={getDMInfo(activeChannel!).avatar!} alt="" className="w-6 h-6 rounded-full object-cover" /> : <UserIcon className="w-5 h-5 text-slate-400" />}
                    <h3 className="font-bold text-slate-900 truncate">{getDMInfo(activeChannel!).name}</h3>
                 </div>
            ) : (
                 <div className="flex items-center gap-2">
                    <Hash className="w-5 h-5 text-slate-400" />
                    <h3 className="font-bold text-slate-900 truncate">{activeChannel?.name}</h3>
                    {activeChannel?.name === 'ask-ai' && <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs rounded-full font-medium">AI</span>}
                    {isChannelReadOnly && <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full font-medium border border-slate-200">Read Only</span>}
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
            >
              <Trash2 className="w-4 h-4 text-slate-300 hover:text-red-500" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
           {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 group ${msg.isAi ? 'bg-brand-50/30 -mx-6 px-6 py-2' : ''}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.isAi ? 'bg-brand-500' : 'bg-slate-200'}`}>
                {msg.isAi ? <Bot className="w-6 h-6 text-white" /> : msg.avatar && msg.avatar !== 'user' && msg.avatar.startsWith('http') ? <img src={msg.avatar} alt="" className="w-full h-full rounded-lg object-cover" /> : <UserIcon className="w-6 h-6 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-slate-900">{msg.sender}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    {msg.isEdited && <span className="ml-1 italic">(edited)</span>}
                  </span>
                </div>
                {msg.attachmentUrl && (
                  <div className="mt-2 mb-1">
                     {msg.attachmentType === 'image' ? (
                        <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer"><img src={msg.attachmentUrl} alt="Attachment" className="max-h-60 rounded-lg border border-slate-200" /></a>
                     ) : (
                        <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-brand-600 underline"><FileText className="w-4 h-4" /> Attachment</a>
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
                    {/* Show edit button only for own messages that aren't AI */}
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
              </div>
            </div>
           ))}
           {loading && <div className="text-sm text-slate-400 italic px-6">NexusBot is typing...</div>}
           <div ref={messagesEndRef} />
        </div>

        <div className="p-6 pt-2 flex-shrink-0 bg-white border-t border-slate-100">
           <div className={`border rounded-xl shadow-sm bg-white flex flex-col relative ${isChannelReadOnly ? 'border-slate-200 bg-slate-50' : 'border-slate-300'}`}>
             {/* Mention Dropdown */}
             {mentionDropdown?.show && (
               <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-[100] animate-fadeIn">
                 <div className="p-2 bg-slate-50 border-b border-slate-200">
                   <p className="text-xs font-bold text-slate-500 uppercase">Mention Someone</p>
                 </div>
                 <div className="max-h-48 overflow-y-auto">
                   {/* @everyone option */}
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

                   {/* Team members */}
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
                disabled={isChannelReadOnly}
                placeholder={
                    isChannelReadOnly
                    ? "Only the Owner can post in this channel."
                    : activeChannel?.type === 'dm'
                        ? `Message ${getDMInfo(activeChannel!).name}... (Use @name or @everyone to mention)`
                        : `Message #${activeChannel?.name}... (Use @name or @everyone to mention)`
                }
                className={`w-full max-h-40 min-h-[60px] p-3 outline-none resize-none rounded-t-xl ${isChannelReadOnly ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
             />
             <div className={`flex justify-between items-center p-2 border-t rounded-b-xl ${isChannelReadOnly ? 'bg-slate-50 border-slate-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex gap-1">
                   <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                   <button onClick={() => fileInputRef.current?.click()} disabled={isChannelReadOnly} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"><ImageIcon className="w-5 h-5" /></button>
                </div>
                <button onClick={handleSendMessage} disabled={loading || isChannelReadOnly || (!message.trim() && !isUploading)} className="p-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed">
                   {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default TeamChat;