import React, { useState, useEffect, useRef } from 'react';
import { Hash, Plus, Trash2, Image as ImageIcon, Send, Bot, User as UserIcon, Loader2, FileText, Users, MessageSquare, RefreshCw, Edit2, X, Check, Smile, Film, SmilePlus, Video, Lock, UserPlus, Menu, ClipboardList, Calendar, ArrowRight, Palette, Paperclip, Download, File, Search, Pin, PinOff, Reply, ChevronDown, ChevronUp, ListTodo } from 'lucide-react';
import { ChatChannel, ChatMessage, User, ToastType, Profile, MessageReaction } from '../types';
import { getChatResponse } from '../services/geminiService';
import { storeEchoConversation, buildConversationContext } from '../services/echoMemory';
import { fetchChatMessages, sendChatMessage, clearChatHistory, uploadFile, fetchChannels, createChannel, deleteChannel, fetchProfiles, getOrCreateDMChannel, createNotification, editChatMessage, fetchMessageReactions, addMessageReaction, removeMessageReaction, fetchChannelMembers, addChannelMember, removeChannelMember, deleteChatMessage, isChannelMember, searchChatMessages, SearchResult, pinMessage, unpinMessage, fetchPinnedMessages, sendReplyMessage, fetchThreadReplies } from '../services/databaseService';
import { startEchoListener } from '../services/echoListener';
import { fetchAllPartners, fetchPartnerMessages, sendPartnerMessage, markPartnerMessagesRead } from '../services/clientPortalService';
import { PartnerWithStats, PartnerMessage } from '../types-portal';
import { supabase } from '../lib/supabaseClient';
import ChatTodoList from './ChatTodoList';
// Removed custom VideoCall - now using Google Meet

// Play a short notification sound for new chat messages
const playMessageSound = async () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (e) {
    // Silently ignore audio errors
  }
};

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
  // Bumped to force the realtime subscription effect to re-run after a dropped
  // connection (CHANNEL_ERROR / TIMED_OUT / CLOSED) so messages keep flowing.
  const [subscriptionGen, setSubscriptionGen] = useState(0);
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

  // Partner chat state
  const [partners, setPartners] = useState<PartnerWithStats[]>([]);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [partnerMessages, setPartnerMessages] = useState<PartnerMessage[]>([]);
  const [partnerMessage, setPartnerMessage] = useState('');
  const [loadingPartnerMessages, setLoadingPartnerMessages] = useState(false);

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [isTeamExpanded, setIsTeamExpanded] = useState(false);

  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchInCurrentChannel, setSearchInCurrentChannel] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Staged attachment state (for paste preview before sending)
  const [stagedAttachment, setStagedAttachment] = useState<{ url: string; file: File; type: 'image' | 'video' | 'file'; name: string } | null>(null);

  // Pinned messages state
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);

  // Threading/Reply state
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [threadReplies, setThreadReplies] = useState<Record<string, ChatMessage[]>>({});
  const [loadingThreads, setLoadingThreads] = useState<Set<string>>(new Set());

  // Todo list state
  const [showTodoList, setShowTodoList] = useState(false);

  // Chat background state - per channel
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [channelBackgrounds, setChannelBackgrounds] = useState<Record<string, { bg: string; customUrl?: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('bf_channel_backgrounds') || '{}');
    } catch { return {}; }
  });
  const bgInputRef = useRef<HTMLInputElement>(null);

  const chatBackgrounds = [
    { id: 'default', name: 'Default', style: 'bg-portal-surface', dark: false },
    { id: 'dark', name: 'Dark', style: 'bg-slate-900', dark: true },
    { id: 'gradient-blue', name: 'Ocean', style: 'bg-gradient-to-br from-blue-100 via-blue-50 to-cyan-100', dark: false },
    { id: 'gradient-purple', name: 'Purple', style: 'bg-gradient-to-br from-purple-100 via-pink-50 to-indigo-100', dark: false },
    { id: 'gradient-green', name: 'Forest', style: 'bg-gradient-to-br from-green-100 via-emerald-50 to-teal-100', dark: false },
    { id: 'gradient-sunset', name: 'Sunset', style: 'bg-gradient-to-br from-orange-100 via-red-50 to-pink-100', dark: false },
    { id: 'gradient-night', name: 'Night', style: 'bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-900', dark: true },
    { id: 'pattern-dots', name: 'Dots', style: 'bg-portal-surface bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]', dark: false },
    { id: 'pattern-grid', name: 'Grid', style: 'bg-portal-surface bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] [background-size:24px_24px]', dark: false },
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
    return bg?.style || 'bg-portal-surface';
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

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr}, ${time}`;
  };

  // Search messages handler with debouncing
  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // Debounce the actual search by 300ms
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchChatMessages(query, {
          channelId: searchInCurrentChannel ? activeChannelId : undefined,
          limit: 50
        });
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        addToast('error', 'Failed to search messages');
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  // Navigate to a search result
  const navigateToSearchResult = async (result: SearchResult) => {
    // Switch to the channel containing the message
    if (result.channelId !== activeChannelId) {
      setActiveChannelId(result.channelId);
    }
    // Close search panel
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    // Wait for messages to load, then scroll to the message
    setTimeout(() => {
      const messageEl = document.getElementById(`msg-${result.message.id}`);
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageEl.classList.add('bg-yellow-100');
        setTimeout(() => messageEl.classList.remove('bg-yellow-100'), 2000);
      }
    }, 500);
  };

  // Format channel name for display in search results
  const formatChannelName = (result: SearchResult) => {
    if (result.channelType === 'dm') {
      // Extract user name from DM channel
      const parts = result.channelName.replace('dm_', '').split('_');
      const otherUserId = parts.find(id => id !== currentUser.id);
      const otherUser = profiles.find(p => p.id === otherUserId);
      return otherUser?.full_name || 'Direct Message';
    }
    return `#${result.channelName}`;
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
        className="mt-2 w-full max-w-sm bg-portal-surface border border-white/[0.07] rounded-xl shadow-sm hover:shadow-md hover:border-brand-300 transition-all text-left group"
      >
        <div className="p-3">
          <div className="flex items-start gap-3">
            <div
              className="w-1 h-full min-h-[3rem] rounded-full flex-shrink-0"
              style={{ backgroundColor: taskLink.statusColor }}
            ></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="w-4 h-4 text-portal-soft" />
                <span className="text-xs text-portal-soft font-medium">{taskLink.boardName}</span>
                <span className="text-xs text-portal-text">•</span>
                <span className="text-xs text-portal-soft">{taskLink.groupTitle}</span>
              </div>
              <p className="font-semibold text-white truncate group-hover:text-brand-600 transition-colors">
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
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-portal-soft'}`}>
                  <Calendar className="w-3 h-3" />
                  {dueDate.toLocaleDateString()}
                </span>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-portal-text group-hover:text-brand-500 transition-colors flex-shrink-0 mt-2" />
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
      // Giphy public API key (safe to use client-side)
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
    const isAdminOrOwner = currentUser.role === 'Owner' || currentUser.role === 'Admin';
    const [chans, profs, partnersData] = await Promise.all([
      fetchChannels(),
      fetchProfiles(),
      // Only fetch partners for Owners/Admins
      isAdminOrOwner ? fetchAllPartners().catch(() => []) : Promise.resolve([])
    ]);
    setChannels(chans);
    setProfiles(profs);
    setPartners(partnersData);
    setIsRefreshing(false);
    return chans;
  };

  // Load partner messages when partner is selected
  const loadPartnerMessages = async (partnerId: string) => {
    setLoadingPartnerMessages(true);
    try {
      const msgs = await fetchPartnerMessages(partnerId);
      setPartnerMessages(msgs);
    } catch (error) {
      console.error('Error loading partner messages:', error);
    } finally {
      setLoadingPartnerMessages(false);
    }
  };

  // Send message to partner
  const handleSendPartnerMessage = async () => {
    if (!activePartnerId || !partnerMessage.trim()) return;

    try {
      await sendPartnerMessage(
        activePartnerId,
        partnerMessage.trim(),
        'team',
        currentUser.id,
        currentUser.name
      );
      setPartnerMessage('');
      // Reload messages
      loadPartnerMessages(activePartnerId);
    } catch (error) {
      console.error('Error sending partner message:', error);
      addToast('error', 'Failed to send message');
    }
  };

  // Handle selecting a partner chat
  const handleSelectPartner = (partnerId: string) => {
    setActivePartnerId(partnerId);
    setActiveChannelId(''); // Deselect any regular channel
    loadPartnerMessages(partnerId);
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

    // Same-tab notification click handler — keeps deep-linking working when user
    // is already on the TeamChat view (init() above only runs once on mount).
    const handleOpenChatNotification = (e: Event) => {
      const data = (e as CustomEvent).detail
        || (() => { try { return JSON.parse(localStorage.getItem('openChatNotification') || '{}'); } catch { return {}; } })();
      if (!data || !data.channelId) return;
      setActiveChannelId(data.channelId);
      localStorage.removeItem('openChatNotification');
    };
    window.addEventListener('openChatNotification', handleOpenChatNotification as EventListener);

    // Boot the live Echo listener (owner-only — no-op for other roles).
    // Lets Echo respond when @echo / @ai is mentioned in any public channel.
    let stopEchoListener: (() => void) | null = null;
    (async () => {
      try {
        const chans = await fetchChannels();
        stopEchoListener = startEchoListener({
          user: currentUser,
          channels: chans,
          echoBotId: ECHO_BOT_ID,
          isEchoAIChannel
        });
      } catch (e) {
        console.error('[TeamChat] failed to start echo listener:', e);
      }
    })();

    return () => {
      supabase.removeChannel(channelSub);
      supabase.removeChannel(profileSub);
      window.removeEventListener('openChatNotification', handleOpenChatNotification as EventListener);
      if (stopEchoListener) stopEchoListener();
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
          callType: newMsg.call_type,
          parentMessageId: newMsg.parent_message_id,
          replyCount: newMsg.reply_count || 0
        };

        // Play notification sound for messages from other users
        if (!newMsg.is_ai && newMsg.sender_id !== currentUser.id) {
          playMessageSound();
        }

        // Only update if message is for current channel
        if (newMsg.channel_id === activeChannelRef.current) {
          // Check if this is a thread reply
          if (newMsg.parent_message_id) {
            console.log('[TeamChat] New reply received for parent:', newMsg.parent_message_id);
            // Update parent's reply count
            setMessages(prev => prev.map(m =>
              m.id === newMsg.parent_message_id
                ? { ...m, replyCount: (m.replyCount || 0) + 1 }
                : m
            ));
            // Add to threadReplies if thread is expanded
            setThreadReplies(prev => {
              if (prev[newMsg.parent_message_id]) {
                // Check for duplicate
                if (prev[newMsg.parent_message_id].some(r => r.id === newMsg.id)) {
                  return prev;
                }
                return {
                  ...prev,
                  [newMsg.parent_message_id]: [...prev[newMsg.parent_message_id], formattedMsg]
                };
              }
              return prev;
            });
          } else {
            // Regular message (not a reply)
            setMessages(prev => {
              // Simple duplicate check by ID only
              if (prev.some(m => m.id === newMsg.id)) {
                console.log('[TeamChat] Message already exists, skipping');
                return prev;
              }
              console.log('[TeamChat] Adding message to current channel');
              return [...prev, formattedMsg];
            });
          }
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
              editedAt: updatedMsg.edited_at,
              replyCount: updatedMsg.reply_count || m.replyCount
            } : m
          ));
          // Update in thread replies only if it's a reply (has parent_message_id)
          if (updatedMsg.parent_message_id) {
            setThreadReplies(prev => {
              const parentReplies = prev[updatedMsg.parent_message_id];
              if (!parentReplies) return prev;
              return {
                ...prev,
                [updatedMsg.parent_message_id]: parentReplies.map(r =>
                  r.id === updatedMsg.id ? {
                    ...r,
                    text: updatedMsg.text,
                    isEdited: updatedMsg.is_edited,
                    editedAt: updatedMsg.edited_at
                  } : r
                )
              };
            });
          }
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const deletedMsg = payload.old as any;
        console.log('[TeamChat] Message DELETE received:', deletedMsg.id);

        // Supabase DELETE payloads often only include the primary key unless
        // REPLICA IDENTITY FULL is enabled, so do not rely on channel_id being
        // present. If the ID is visible anywhere in this chat state, remove it.
        if (!deletedMsg.channel_id || deletedMsg.channel_id === activeChannelRef.current) {
          // Remove from main messages
          setMessages(prev => prev.filter(m => m.id !== deletedMsg.id));

          // Remove from every expanded thread as a fallback when parent_message_id
          // is absent from the DELETE payload.
          setThreadReplies(prev => {
            const next: Record<string, ChatMessage[]> = {};
            for (const [parentId, replies] of Object.entries(prev)) {
              next[parentId] = replies.filter(r => r.id !== deletedMsg.id);
            }
            return next;
          });

          // Remove from thread replies if it was a reply
          if (deletedMsg.parent_message_id) {
            setThreadReplies(prev => {
              const parentReplies = prev[deletedMsg.parent_message_id];
              if (!parentReplies) return prev;
              return {
                ...prev,
                [deletedMsg.parent_message_id]: parentReplies.filter(r => r.id !== deletedMsg.id)
              };
            });
            // Decrement parent's reply count
            setMessages(prev => prev.map(m =>
              m.id === deletedMsg.parent_message_id
                ? { ...m, replyCount: Math.max(0, (m.replyCount || 0) - 1) }
                : m
            ));
          }
        }
      })
      .subscribe((status) => {
        console.log('[TeamChat] Message subscription status:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Reconnect after a short delay to avoid tight loops
          setTimeout(() => setSubscriptionGen(g => g + 1), 1500);
        }
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
  }, [currentUser.id, currentUser.name, subscriptionGen]); // subscriptionGen bumps force a fresh channel after disconnect

  // Catch-up on tab focus / network recovery: refetch the active channel and
  // merge by ID so any messages missed while the socket was disconnected
  // appear without disrupting paginated history.
  useEffect(() => {
    const catchUp = async () => {
      const channelId = activeChannelRef.current;
      if (!channelId) return;
      try {
        const fresh = await fetchChatMessages(channelId);
        // Replace the active-channel window, rather than merge-only. Merge-only
        // keeps messages that were deleted while the socket was asleep, which is
        // exactly the "not live" behaviour people are seeing.
        setMessages(fresh);
      } catch (e) {
        console.error('[TeamChat] catch-up refetch failed:', e);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') catchUp();
    };
    const onOnline = () => {
      setSubscriptionGen(g => g + 1);
      catchUp();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    const catchUpTimer = window.setInterval(catchUp, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.clearInterval(catchUpTimer);
    };
  }, []);

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
      setIsLoadingMessages(true);
      // DO NOT clear messages here - keep previous channel's messages visible while loading
      setMessageReactions({});
      setHasMoreMessages(false);
      setReplyingToMessage(null);
      setExpandedThreads(new Set());
      setThreadReplies({});

      // Fetch fresh from database (last 100 messages)
      const msgs = await fetchChatMessages(currentChannelId);

      // CRITICAL: Check if user switched channels while we were fetching
      // If they did, don't update state with stale data
      if (activeChannelRef.current !== currentChannelId) {
        console.log('[TeamChat] Channel changed during fetch, discarding stale messages');
        setIsLoadingMessages(false);
        return;
      }

      console.log(`[TeamChat] Loaded ${msgs.length} messages from database`);

      // Atomic swap: clear and set in one render cycle
      setMessages(msgs);
      setIsLoadingMessages(false);
      // If we got exactly 100 messages, there might be more
      setHasMoreMessages(msgs.length === 100);
      scrollToBottom();

      // Load pinned messages for this channel
      const pinned = await fetchPinnedMessages(currentChannelId);
      if (activeChannelRef.current === currentChannelId) {
        setPinnedMessages(pinned);
      }

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

  // Toggle thread expansion and load replies if needed
  const toggleThreadExpansion = async (messageId: string) => {
    const isCurrentlyExpanded = expandedThreads.has(messageId);

    if (isCurrentlyExpanded) {
      // Collapse thread
      setExpandedThreads(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    } else {
      // Expand thread and load replies if not already loaded
      setExpandedThreads(prev => new Set(prev).add(messageId));

      if (!threadReplies[messageId]) {
        setLoadingThreads(prev => new Set(prev).add(messageId));
        try {
          const replies = await fetchThreadReplies(messageId);
          setThreadReplies(prev => ({ ...prev, [messageId]: replies }));
        } catch (error) {
          console.error('[toggleThreadExpansion] Error loading replies:', error);
          addToast('error', 'Failed to load replies');
        } finally {
          setLoadingThreads(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });
        }
      }
    }
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

  const handlePinMessage = async (messageId: string) => {
    try {
      await pinMessage(messageId, currentUser.id);
      // Update message in UI
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isPinned: true, pinnedAt: new Date().toISOString(), pinnedBy: currentUser.id } : m
      ));
      // Update pinned messages list
      const pinned = await fetchPinnedMessages(activeChannelId);
      setPinnedMessages(pinned);
      addToast('success', 'Message pinned');
    } catch (error: any) {
      console.error('[TeamChat] Failed to pin message:', error);
      addToast('error', `Failed to pin: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleUnpinMessage = async (messageId: string) => {
    try {
      await unpinMessage(messageId);
      // Update message in UI
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isPinned: false, pinnedAt: undefined, pinnedBy: undefined } : m
      ));
      // Update pinned messages list
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
      addToast('success', 'Message unpinned');
    } catch (error: any) {
      console.error('[TeamChat] Failed to unpin message:', error);
      addToast('error', `Failed to unpin: ${error?.message || 'Unknown error'}`);
    }
  };

  const loadPinnedMessages = async (channelId: string) => {
    const pinned = await fetchPinnedMessages(channelId);
    setPinnedMessages(pinned);
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
    console.log('[handleSendMessage] Staged attachment:', stagedAttachment);
    console.log('[handleSendMessage] Replying to:', replyingToMessage?.id);

    // Allow sending if there's a message OR a staged attachment
    if (!message.trim() && !stagedAttachment) {
      console.log('[handleSendMessage] Empty message and no attachment, aborting');
      return;
    }

    const currentCh = channels.find(c => c.id === activeChannelId);
    console.log('[handleSendMessage] Current channel:', currentCh);

    // Determine message text for sending
    let sendText = message.trim();
    if (!sendText && stagedAttachment) {
      if (stagedAttachment.type === 'image') sendText = 'Sent an image';
      else if (stagedAttachment.type === 'video') sendText = 'Sent a video';
      else sendText = `Sent file: ${stagedAttachment.name}`;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      channelId: activeChannelId,
      sender: currentUser.name,
      senderId: currentUser.id,
      text: sendText,
      timestamp: new Date().toISOString(),
      avatar: currentUser.avatarUrl || 'user',
      ...(stagedAttachment && {
        attachmentUrl: stagedAttachment.url,
        attachmentType: stagedAttachment.type,
        attachmentName: stagedAttachment.name
      })
    };

    console.log('[handleSendMessage] Constructed message:', userMsg);

    const mentions = detectMentions(message.trim());
    const messageText = message;
    const savedStagedAttachment = stagedAttachment;
    const savedReplyingTo = replyingToMessage;
    setMessage('');
    setStagedAttachment(null);
    setMentionDropdown(null);
    setReplyingToMessage(null); // Clear reply state

    // Send to database - realtime listener will add it to UI
    console.log('[handleSendMessage] Calling sendChatMessage...');
    try {
      let result;

      // Check if this is a reply to another message
      if (savedReplyingTo) {
        console.log('[handleSendMessage] Sending as reply to:', savedReplyingTo.id);
        result = await sendReplyMessage(userMsg, savedReplyingTo.id);

        // Update parent message's reply count in local state
        setMessages(prev => prev.map(m =>
          m.id === savedReplyingTo.id
            ? { ...m, replyCount: (m.replyCount || 0) + 1 }
            : m
        ));

        // Add reply to threadReplies if thread is expanded
        if (expandedThreads.has(savedReplyingTo.id)) {
          const insertedReply: ChatMessage = {
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
            taskLink: result.task_link,
            parentMessageId: result.parent_message_id
          };
          setThreadReplies(prev => {
            const existing = prev[savedReplyingTo.id] || [];
            // Check for duplicate
            if (existing.some(r => r.id === result.id)) {
              return prev;
            }
            return {
              ...prev,
              [savedReplyingTo.id]: [...existing, insertedReply]
            };
          });
        }
      } else {
        result = await sendChatMessage(userMsg);
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
          taskLink: result.task_link,
          replyCount: 0
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
      }
      scrollToBottom();
    } catch (error: any) {
      console.error('[handleSendMessage] Failed to send message:', error);
      console.error('[handleSendMessage] Error details:', error.message, error.details, error.hint);
      const errorMsg = error.message || error.details || 'Unknown error';
      alert(`Message failed: ${errorMsg}\n\nCode: ${error.code || 'none'}\nHint: ${error.hint || 'none'}`);
      addToast('error', `Failed to send message: ${errorMsg}`);
      setMessage(messageText); // Restore message on error
      setStagedAttachment(savedStagedAttachment); // Restore attachment on error
      setReplyingToMessage(savedReplyingTo); // Restore reply state on error
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

    // Create notifications for @mentions and live-chat activity in channels (skip Echo AI)
    if (currentCh?.type === 'channel' && !isEchoAIChannel(currentCh)) {
      const mentionedSet = new Set(mentions.filter(id => id !== currentUser.id));

      // 1) Mentions get a high-signal notification
      for (const mentionedId of mentionedSet) {
        if (currentCh.is_private) {
          const isMember = await isChannelMember(currentCh.id, mentionedId);
          if (!isMember) {
            console.log(`[Notification] Skipping mention for non-member ${mentionedId} in private channel ${currentCh.name}`);
            mentionedSet.delete(mentionedId);
            continue;
          }
        }
        try {
          await createNotification(
            mentionedId,
            `${currentUser.name} mentioned you in #${currentCh.name}`,
            userMsg.text.substring(0, 100),
            'message',
            'TEAM_CHAT',
            { channelId: activeChannelId, channelName: currentCh.name, channelType: 'channel' }
          );
        } catch (e) {
          console.error('[Notification] mention insert failed', e);
        }
      }

      // 2) Notify other channel members about the new message (excluding sender + already-mentioned).
      // Private channel: members table. Public channel: notify all profiles (so the team sees activity).
      try {
        let recipientIds: string[] = [];
        if (currentCh.is_private) {
          const members = await fetchChannelMembers(currentCh.id);
          recipientIds = (members || []).map((m: any) => m.user_id);
        } else {
          const allProfiles = await fetchProfiles();
          recipientIds = allProfiles.map(p => p.id);
        }

        const toNotify = recipientIds.filter(uid =>
          uid && uid !== currentUser.id && !mentionedSet.has(uid)
        );

        await Promise.all(toNotify.map(async (uid) => {
          try {
            await createNotification(
              uid,
              `New message in #${currentCh.name}`,
              `${currentUser.name}: ${userMsg.text.substring(0, 100)}`,
              'message',
              'TEAM_CHAT',
              { channelId: activeChannelId, channelName: currentCh.name, channelType: 'channel' }
            );
          } catch (e) {
            console.error('[Notification] channel-member insert failed for', uid, e);
          }
        }));
      } catch (e) {
        console.error('[Notification] channel broadcast failed', e);
      }
    }

    // AI Response for Echo AI DM channels
    if (currentCh && isEchoAIChannel(currentCh)) {
      setLoading(true);

      // Post a "thinking" placeholder immediately so the user sees Echo is working
      // (no more silent lag). We'll edit it with the real reply when ready.
      let placeholderMsgId: string | null = null;
      try {
        const placeholder = await sendChatMessage({
          id: '',
          channelId: activeChannelId,
          sender: 'Echo AI',
          senderId: currentUser.id,
          text: '⏳ Echo is thinking…',
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        });
        placeholderMsgId = placeholder?.id || null;
      } catch (e) {
        console.error('[Echo] placeholder failed:', e);
      }

      try {
        // Route through portal bridge — handles admin/member permissions and local model routing
        const BRIDGE_URL = (import.meta as any).env?.VITE_BRIDGE_URL || 'http://localhost:18790';
        const BRIDGE_SECRET = (import.meta as any).env?.VITE_ECHO_BRIDGE_SECRET || 'brightforge-echo-bridge-2026';
        const bridgeRes = await fetch(`${BRIDGE_URL}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BRIDGE_SECRET}`,
          },
          body: JSON.stringify({
            message: userMsg.text,
            userId: currentUser.id,
            userName: currentUser.name,
            history: messages.slice(-8).map(m => ({
              role: m.isAi ? 'assistant' : 'user',
              content: `${m.sender}: ${m.text}`,
            })),
          }),
        });

        let response: string;
        if (bridgeRes.ok) {
          const data = await bridgeRes.json();
          response = data.response || '(no response)';
        } else {
          // Fallback to getChatResponse if bridge is down
          const recentHistory = messages.slice(-10).map(m => `${m.sender}: ${m.text}`).join('\n');
          let pastContext = '';
          try { pastContext = await buildConversationContext(currentUser.id, activeChannelId); } catch (e) {}
          response = await getChatResponse(pastContext + '\n\n' + recentHistory, userMsg.text, {
            id: currentUser.id,
            name: currentUser.name
          });
        }

        // If we have a placeholder, edit it in place; otherwise insert fresh.
        if (placeholderMsgId) {
          try {
            await editChatMessage(placeholderMsgId, response);
            // Update local state to reflect the edit
            setMessages(prev => prev.map(m => m.id === placeholderMsgId
              ? { ...m, text: response, isEdited: true, editedAt: new Date().toISOString() }
              : m
            ));
            return;
          } catch (e) {
            console.error('[Echo] edit-placeholder failed, falling through to insert:', e);
          }
        }

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
          // Stage the image for preview instead of sending immediately
          setIsUploading(true);
          const url = await uploadFile(file);
          setIsUploading(false);
          if (url) {
            setStagedAttachment({
              url,
              file,
              type: 'image',
              name: file.name || 'clipboard-image.png'
            });
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
    const file = e.target.files[0];
    setIsUploading(true);
    const url = await uploadFile(file);
    setIsUploading(false);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (url) {
      const mimeType = file.type;
      let type: 'image' | 'video' | 'file' = 'file';
      if (mimeType.startsWith('image/')) type = 'image';
      else if (mimeType.startsWith('video/')) type = 'video';

      // Stage the file for preview instead of sending immediately
      setStagedAttachment({
        url,
        file,
        type,
        name: file.name
      });
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
    <div className="flex h-full overflow-hidden bg-portal-dark">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Channels Sidebar */}
      <div className={`
        w-72 md:w-64 bg-portal-surface flex flex-col flex-shrink-0
        fixed md:relative inset-y-0 left-0 z-50
        transform transition-transform duration-300 ease-out
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="h-14 md:h-11 px-3 flex items-center justify-between border-b border-white/[0.07] flex-shrink-0 safe-area-inset-top">
          <h2 className="font-bold text-white truncate text-base md:text-sm">Bright Forge</h2>
          <div className="flex items-center gap-2 md:gap-1">
            {currentUser.role === 'Owner' && (
              <button onClick={() => setShowCreateChannel(true)} className="p-2 md:p-1 text-portal-text hover:text-white hover:bg-portal-surface2 rounded-lg md:rounded transition-colors active:bg-portal-surface2" title="New Channel">
                <Plus className="w-5 h-5 md:w-4 md:h-4" />
              </button>
            )}
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden p-2 text-portal-text hover:text-white hover:bg-portal-surface2 rounded-lg transition-colors active:bg-portal-surface2"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showCreateChannel && (
          <div className="p-2 bg-portal-surface2 border-b border-white/[0.07]">
            <input
              autoFocus
              className="w-full text-xs p-1 rounded text-slate-900 bg-white outline-none mb-1"
              placeholder="channel-name"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
            />
            <label className="flex items-center text-xs text-portal-soft mb-1 cursor-pointer">
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

          {/* Search */}
          <div className="px-2">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-portal-surface2 rounded-lg border border-white/[0.05]">
              <Search className="w-3.5 h-3.5 text-portal-soft flex-shrink-0" />
              <input
                type="text"
                placeholder="Search…"
                value={channelSearch}
                onChange={e => setChannelSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-portal-text placeholder-portal-soft outline-none min-w-0"
              />
              {channelSearch && (
                <button onClick={() => setChannelSearch('')} className="text-portal-soft hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* AI Assistant Section */}
          <div>
            <div className="px-3 flex items-center justify-between text-portal-soft mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider">AI Assistant</span>
            </div>
            <ul>
              {echoAIChannel ? (
                <li
                  key={echoAIChannel.id}
                  onClick={() => setActiveChannelId(echoAIChannel.id)}
                  className={`px-3 py-2.5 md:py-2 flex items-center justify-between cursor-pointer mx-1.5 rounded-lg group active:opacity-80 ${activeChannelId === echoAIChannel.id ? 'bg-portal-accent text-white' : 'text-portal-soft hover:bg-portal-surface2'}`}
                >
                  <div className="flex items-center gap-2.5 md:gap-2 truncate">
                    <div className="w-6 h-6 md:w-5 md:h-5 rounded-md bg-brand-500 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className={`truncate text-sm font-medium ${echoAIChannel.unread ? 'text-white' : ''}`}>
                      Echo AI
                    </span>
                  </div>
                  {echoAIChannel.unread ? (
                    <span className="ml-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 flex-shrink-0">
                      {echoAIChannel.unread}
                    </span>
                  ) : null}
                </li>
              ) : (
                <li
                  onClick={handleStartEchoAI}
                  className="px-3 py-2.5 md:py-2 flex items-center gap-2.5 md:gap-2 mx-1.5 rounded-lg text-portal-soft hover:bg-portal-surface2 cursor-pointer active:opacity-80"
                >
                  <div className="w-6 h-6 md:w-5 md:h-5 rounded-md bg-brand-500/30 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-brand-400" />
                  </div>
                  <span className="truncate text-sm">Start Echo AI Chat</span>
                </li>
              )}
            </ul>
          </div>

          {/* Public Channels */}
          <div>
            <div className="px-3 flex items-center justify-between group text-portal-soft mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Channels</span>
            </div>
            <ul className="space-y-0.5">
              {publicChannels
                .filter(c => !channelSearch || c.name.toLowerCase().includes(channelSearch.toLowerCase()))
                .map(channel => (
                <li
                  key={channel.id}
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`px-3 py-2.5 md:py-2 flex items-center justify-between cursor-pointer mx-1.5 rounded-lg group active:opacity-80 ${activeChannelId === channel.id ? 'bg-portal-accent text-white' : 'text-portal-soft hover:bg-portal-surface2'}`}
                >
                  <div className="flex items-center gap-2 md:gap-1.5 truncate min-w-0">
                    {channel.is_private ? (
                      <Lock className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                    )}
                    <span className={`truncate text-sm ${channel.unread ? 'font-semibold text-white' : ''}`}>
                      {channel.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                    {channel.unread ? (
                      <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                        {channel.unread}
                      </span>
                    ) : null}
                    {channel.is_private && channel.owner_id === currentUser.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowMembersModal(true); loadChannelMembers(channel.id); }}
                        className="opacity-0 group-hover:opacity-100 text-portal-soft hover:text-blue-400 p-0.5"
                        title="Manage members"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {currentUser.role === 'Owner' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete #${channel.name} and all its messages?`)) handleDeleteChannel(channel.id); }}
                        className="opacity-0 group-hover:opacity-100 text-portal-soft hover:text-red-400 p-0.5"
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
            <div className="px-3 flex items-center justify-between group text-portal-soft mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Direct Messages</span>
              <button onClick={refreshData} title="Refresh" className={`${isRefreshing ? 'animate-spin' : ''} hover:text-white p-0.5`}>
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            </div>
            <ul className="space-y-0.5">
              {dmChannels
                .filter(c => {
                  if (!channelSearch) return true;
                  const { name } = getDMInfo(c);
                  return name.toLowerCase().includes(channelSearch.toLowerCase());
                })
                .map(channel => {
                  const { name, avatar, isOnline } = getDMInfo(channel);
                  return (
                    <li
                      key={channel.id}
                      onClick={() => setActiveChannelId(channel.id)}
                      className={`px-3 py-2 md:py-1.5 flex items-center gap-2.5 md:gap-2 mx-1.5 rounded-lg group cursor-pointer active:opacity-80 ${activeChannelId === channel.id ? 'bg-portal-accent text-white' : 'text-portal-soft hover:bg-portal-surface2'}`}
                    >
                      <div className="relative w-6 h-6 flex-shrink-0">
                        {avatar ? (
                          <img src={avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-portal-dark flex items-center justify-center text-[10px] text-white font-bold">
                            {name.charAt(0)}
                          </div>
                        )}
                        {channel.unread ? (
                          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-portal-surface" />
                        ) : isOnline ? (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-portal-surface" />
                        ) : null}
                      </div>
                      <span className={`truncate text-sm flex-1 ${channel.unread ? 'font-semibold text-white' : ''}`}>
                        {name}
                      </span>
                      {channel.unread ? (
                        <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 flex-shrink-0">
                          {channel.unread}
                        </span>
                      ) : null}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete conversation with ${name}?`)) handleDeleteChannel(channel.id); }}
                        className="opacity-0 group-hover:opacity-100 text-portal-soft hover:text-red-400 flex-shrink-0 p-0.5"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </li>
                  );
                })}
              {dmChannels.length === 0 && <li className="px-3 text-[10px] text-portal-soft italic py-1">No active chats</li>}
            </ul>
          </div>

          {/* Partner Chats */}
          {partners.length > 0 && (currentUser.role === 'Owner' || currentUser.role === 'Admin') && (
            <div>
              <div className="px-3 flex items-center justify-between group text-portal-soft mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Partner Chats</span>
                <Users className="w-2.5 h-2.5 text-purple-400" />
              </div>
              <ul className="space-y-0.5">
                {partners.map(partner => (
                  <li
                    key={partner.id}
                    onClick={() => handleSelectPartner(partner.id)}
                    className={`px-3 py-2 md:py-1.5 flex items-center gap-2.5 md:gap-2 mx-1.5 rounded-lg group cursor-pointer active:opacity-80 ${activePartnerId === partner.id ? 'bg-purple-600 text-white' : 'text-portal-soft hover:bg-portal-surface2'}`}
                  >
                    <div className="relative w-6 h-6 flex-shrink-0">
                      {partner.avatar_url ? (
                        <img src={partner.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-[10px] text-white font-bold">
                          {partner.company_name.charAt(0)}
                        </div>
                      )}
                      {partner.unreadMessages > 0 && (
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-portal-surface" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`truncate text-sm block ${partner.unreadMessages > 0 ? 'font-semibold text-white' : ''}`}>
                        {partner.company_name}
                      </span>
                      <span className="text-[10px] text-portal-soft truncate block">{partner.full_name}</span>
                    </div>
                    {partner.unreadMessages > 0 && (
                      <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 flex-shrink-0">
                        {partner.unreadMessages}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Team — collapsible */}
          <div>
            <button
              onClick={() => setIsTeamExpanded(prev => !prev)}
              className="w-full px-3 flex items-center justify-between text-portal-soft mb-1 hover:text-portal-text transition-colors"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider">Team</span>
              <div className="flex items-center gap-1">
                <Users className="w-2.5 h-2.5" />
                <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isTeamExpanded ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isTeamExpanded && (
              <ul className="space-y-0.5">
                {profiles
                  .filter(p => !channelSearch || (p.full_name || '').toLowerCase().includes(channelSearch.toLowerCase()))
                  .map(p => (
                  <li
                    key={p.id}
                    onClick={() => handleStartDM(p.id)}
                    className="px-3 py-2 md:py-1.5 flex items-center gap-2.5 md:gap-2 mx-1.5 text-portal-soft hover:bg-portal-surface2 rounded-lg cursor-pointer transition-colors active:opacity-80"
                  >
                    <div className="relative w-6 h-6 flex-shrink-0">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-portal-dark flex items-center justify-center text-[10px] text-white font-bold">
                          {p.full_name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-portal-surface ${p.isOnline ? 'bg-green-500' : 'bg-slate-600'}`} />
                    </div>
                    <span className="truncate text-sm flex-1">
                      {p.full_name || p.email?.split('@')[0] || 'Team Member'}
                      {p.id === currentUser.id && <span className="ml-1 text-[10px] text-portal-soft">(You)</span>}
                    </span>
                    {p.isOnline && p.id !== currentUser.id && (
                      <span className="text-[9px] text-green-400 flex-shrink-0">●</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-portal-surface h-full">
        {/* Partner Chat View */}
        {activePartnerId ? (
          <>
            {/* Partner Chat Header */}
            <div className="h-14 md:h-16 border-b border-white/[0.07] flex items-center justify-between px-2 md:px-6 flex-shrink-0 bg-portal-dark safe-area-inset-top">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="md:hidden p-2.5 hover:bg-portal-surface2 rounded-xl flex-shrink-0 active:bg-portal-surface2 transition-colors"
                  title="Open menu"
                  aria-label="Open channel list"
                >
                  <Menu className="w-6 h-6 text-portal-soft" />
                </button>
                {(() => {
                  const activePartner = partners.find(p => p.id === activePartnerId);
                  return activePartner ? (
                    <div className="flex items-center gap-2">
                      {activePartner.avatar_url ? (
                        <img src={activePartner.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm">
                          {activePartner.company_name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-white text-sm md:text-base">{activePartner.company_name}</h3>
                        <p className="text-xs text-portal-soft">{activePartner.full_name} - Partner</p>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
              <button
                onClick={() => {
                  setActivePartnerId(null);
                  setPartnerMessages([]);
                }}
                className="p-2 text-portal-soft hover:text-portal-soft hover:bg-portal-surface2 rounded-lg transition-colors"
                title="Close partner chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Partner Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-portal-dark">
              {loadingPartnerMessages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                </div>
              ) : partnerMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-portal-soft">
                  <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">No messages yet</p>
                  <p className="text-sm mt-1">Start a conversation with this partner</p>
                </div>
              ) : (
                partnerMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.sender_type === 'team' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.sender_type === 'partner' && (
                      <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {msg.sender_name.charAt(0)}
                      </div>
                    )}
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        msg.sender_type === 'team'
                          ? 'bg-purple-600 text-white rounded-br-md'
                          : 'bg-portal-surface border border-white/[0.07] text-white rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      <p className={`text-[10px] mt-1 ${msg.sender_type === 'team' ? 'text-purple-200' : 'text-portal-soft'}`}>
                        {formatMessageTime(msg.created_at)}
                      </p>
                    </div>
                    {msg.sender_type === 'team' && (
                      <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {currentUser.name.charAt(0)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Partner Chat Input */}
            <div className="p-4 bg-portal-surface border-t border-white/[0.07]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={partnerMessage}
                  onChange={(e) => setPartnerMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendPartnerMessage()}
                  placeholder="Type a message to partner..."
                  className="flex-1 px-4 py-3 bg-portal-dark border border-white/[0.07] rounded-xl text-white placeholder-portal-soft focus:outline-none focus:border-purple-400 focus:bg-portal-surface transition-colors"
                />
                <button
                  onClick={handleSendPartnerMessage}
                  disabled={!partnerMessage.trim()}
                  className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
        <>
        {/* Regular Channel Chat Header */}
        <div className="h-14 md:h-16 border-b border-white/[0.07] flex items-center justify-between px-2 md:px-6 flex-shrink-0 bg-portal-surface safe-area-inset-top">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2.5 hover:bg-portal-surface2 rounded-xl flex-shrink-0 active:bg-portal-surface2 transition-colors"
              title="Open menu"
              aria-label="Open channel list"
            >
              <Menu className="w-6 h-6 text-portal-soft" />
            </button>
            {activeChannel?.type === 'dm' ? (
              <div className="flex items-center gap-2">
                {isEchoAIChannel(activeChannel) ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-bold text-white truncate text-sm md:text-base">Echo AI</h3>
                    <span className="hidden sm:inline px-2 py-0.5 bg-brand-100 text-brand-700 text-xs rounded-full font-medium">AI Assistant</span>
                  </>
                ) : getDMInfo(activeChannel!).avatar && getDMInfo(activeChannel!).avatar !== 'bot' ? (
                  <>
                    <img src={getDMInfo(activeChannel!).avatar!} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <h3 className="font-bold text-white truncate text-sm md:text-base">{getDMInfo(activeChannel!).name}</h3>
                  </>
                ) : (
                  <>
                    <UserIcon className="w-5 h-5 text-portal-soft" />
                    <h3 className="font-bold text-white truncate text-sm md:text-base">{getDMInfo(activeChannel!).name}</h3>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <Hash className="w-4 h-4 md:w-5 md:h-5 text-portal-soft flex-shrink-0" />
                <h3 className="font-bold text-white truncate text-sm md:text-base">{activeChannel?.name}</h3>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {/* Pinned Messages Button */}
            {pinnedMessages.length > 0 && (
              <button
                onClick={() => setShowPinnedMessages(!showPinnedMessages)}
                className={`p-1.5 md:p-2 hover:bg-amber-50 rounded-lg transition-colors group relative ${showPinnedMessages ? 'bg-amber-50' : ''}`}
                title={`${pinnedMessages.length} Pinned Message${pinnedMessages.length > 1 ? 's' : ''}`}
              >
                <Pin className={`w-4 h-4 md:w-5 md:h-5 ${showPinnedMessages ? 'text-amber-600' : 'text-portal-soft group-hover:text-amber-600'}`} />
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {pinnedMessages.length}
                </span>
              </button>
            )}
            {/* Todo/Reminders Button */}
            <button
              onClick={() => setShowTodoList(true)}
              className="p-1.5 md:p-2 hover:bg-violet-50 rounded-lg transition-colors group"
              title="Team Reminders"
            >
              <ListTodo className="w-4 h-4 md:w-5 md:h-5 text-portal-soft group-hover:text-violet-600" />
            </button>
            {/* Search Button */}
            <button
              onClick={() => {
                setShowSearch(!showSearch);
                if (!showSearch) {
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }
              }}
              className={`p-1.5 md:p-2 hover:bg-blue-50 rounded-lg transition-colors group ${showSearch ? 'bg-blue-50' : ''}`}
              title="Search Messages"
            >
              <Search className={`w-4 h-4 md:w-5 md:h-5 ${showSearch ? 'text-blue-600' : 'text-portal-soft group-hover:text-blue-600'}`} />
            </button>
            {activeChannelId && (
              <button
                onClick={startVideoCall}
                className="p-1.5 md:p-2 hover:bg-green-50 rounded-lg transition-colors group"
                title="Start Video Call"
              >
                <Video className="w-4 h-4 md:w-5 md:h-5 text-portal-soft group-hover:text-green-600" />
              </button>
            )}
            {/* Background Picker */}
            <div className="relative">
              <button
                onClick={() => setShowBackgroundPicker(!showBackgroundPicker)}
                className="p-1.5 md:p-2 hover:bg-purple-50 rounded-lg transition-colors group"
                title="Change Background"
              >
                <Palette className="w-4 h-4 md:w-5 md:h-5 text-portal-soft group-hover:text-purple-600" />
              </button>
              {showBackgroundPicker && (
                <div className="absolute right-0 top-full mt-2 bg-portal-surface rounded-xl shadow-xl border border-white/[0.07] p-4 z-50 w-80 max-h-[70vh] overflow-y-auto">
                  <h4 className="text-sm font-semibold text-portal-text mb-2">Colors & Patterns</h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {chatBackgrounds.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => handleBackgroundChange(bg.id)}
                        className={`h-12 rounded-lg border-2 transition-all ${bg.style} ${getChannelBackground() === bg.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-white/[0.07] hover:border-white/[0.07]'}`}
                        title={bg.name}
                      >
                        <span className="sr-only">{bg.name}</span>
                      </button>
                    ))}
                  </div>

                  <h4 className="text-sm font-semibold text-portal-text mb-2">Photo Backgrounds</h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {imageBackgrounds.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => handleBackgroundChange(bg.id)}
                        className={`h-16 rounded-lg border-2 transition-all bg-cover bg-center ${getChannelBackground() === bg.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-white/[0.07] hover:border-white/[0.07]'}`}
                        style={{ backgroundImage: `url(${bg.url})` }}
                        title={bg.name}
                      >
                        <span className="sr-only">{bg.name}</span>
                      </button>
                    ))}
                  </div>

                  <h4 className="text-sm font-semibold text-portal-text mb-2">Christmas</h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {christmasBackgrounds.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => handleBackgroundChange(bg.id)}
                        className={`h-16 rounded-lg border-2 transition-all bg-cover bg-center ${getChannelBackground() === bg.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-white/[0.07] hover:border-white/[0.07]'}`}
                        style={{ backgroundImage: `url(${bg.url})` }}
                        title={bg.name}
                      >
                        <span className="sr-only">{bg.name}</span>
                      </button>
                    ))}
                  </div>

                  <h4 className="text-sm font-semibold text-portal-text mb-2">Custom Image</h4>
                  <input
                    type="file"
                    ref={bgInputRef}
                    onChange={handleCustomBgUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    onClick={() => bgInputRef.current?.click()}
                    className={`w-full py-2 px-3 border-2 border-dashed rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${getChannelBackground() === 'custom' ? 'border-brand-500 text-brand-600 bg-brand-50' : 'border-white/[0.07] text-portal-soft hover:border-brand-400 hover:text-brand-600'}`}
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
                <Trash2 className="w-4 h-4 text-portal-text hover:text-red-500" />
              </button>
            )}
          </div>
        </div>

        {/* Search Panel */}
        {showSearch && (
          <div className="border-b border-white/[0.07] bg-portal-dark p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full pl-10 pr-4 py-2 bg-portal-surface border border-white/[0.07] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft animate-spin" />
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-portal-soft whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={searchInCurrentChannel}
                  onChange={(e) => {
                    setSearchInCurrentChannel(e.target.checked);
                    if (searchQuery) handleSearch(searchQuery);
                  }}
                  className="rounded border-white/[0.07] text-brand-500 focus:ring-brand-500"
                />
                Current channel only
              </label>
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="p-1.5 hover:bg-portal-surface2 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-portal-soft" />
              </button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                {searchResults.map((result) => (
                  <button
                    key={result.message.id}
                    onClick={() => navigateToSearchResult(result)}
                    className="w-full text-left p-3 bg-portal-surface rounded-lg border border-white/[0.07] hover:border-brand-300 hover:bg-brand-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-brand-600">
                        {formatChannelName(result)}
                      </span>
                      <span className="text-xs text-portal-soft">
                        {new Date(result.message.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-portal-text">{result.message.sender}</span>
                    </div>
                    <p className="text-sm text-portal-soft line-clamp-2">
                      {result.message.text}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* No results message */}
            {searchQuery && !isSearching && searchResults.length === 0 && (
              <div className="mt-3 text-center py-4 text-sm text-portal-soft">
                No messages found for "{searchQuery}"
              </div>
            )}
          </div>
        )}

        {/* Pinned Messages Panel */}
        {showPinnedMessages && pinnedMessages.length > 0 && (
          <div className="border-b border-white/[0.07] bg-amber-50 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-amber-600" />
                <h4 className="font-semibold text-portal-text">Pinned Messages ({pinnedMessages.length})</h4>
              </div>
              <button
                onClick={() => setShowPinnedMessages(false)}
                className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-portal-soft" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pinnedMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-3 bg-portal-surface rounded-lg border border-amber-200 hover:border-amber-300 transition-colors cursor-pointer"
                  onClick={async () => {
                    setShowPinnedMessages(false);

                    // Check if the message is already in the loaded messages
                    let messageEl = document.getElementById(`msg-${msg.id}`);

                    if (!messageEl) {
                      // Message not loaded yet — load all messages from beginning up to and including the pinned one
                      try {
                        const allMsgs = await fetchChatMessages(activeChannelId, 5000);
                        setMessages(allMsgs);
                        setHasMoreMessages(false);
                        // Wait for DOM to update
                        await new Promise(resolve => setTimeout(resolve, 300));
                        messageEl = document.getElementById(`msg-${msg.id}`);
                      } catch (e) {
                        console.error('[TeamChat] Failed to load messages for pinned scroll:', e);
                      }
                    }

                    if (messageEl) {
                      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      messageEl.classList.add('bg-yellow-100');
                      setTimeout(() => messageEl!.classList.remove('bg-yellow-100'), 2000);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-portal-text">{msg.sender}</span>
                      <span className="text-xs text-portal-soft">
                        {new Date(msg.timestamp).toLocaleDateString()} {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnpinMessage(msg.id); }}
                      className="p-1 hover:bg-portal-surface2 rounded text-portal-soft hover:text-red-500 transition-colors"
                      title="Unpin message"
                    >
                      <PinOff className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-portal-soft line-clamp-3">{msg.text}</p>
                  {msg.attachmentUrl && (
                    <div className="mt-2">
                      {msg.attachmentType === 'image' ? (
                        <img src={msg.attachmentUrl} alt="" className="max-h-20 rounded" />
                      ) : (
                        <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <File className="w-3 h-3" />
                          {msg.attachmentName || 'Attachment'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className={`relative flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 ${getCurrentBackgroundStyle()} bg-cover bg-center bg-fixed`}
          style={getCurrentBackgroundImage() ? { backgroundImage: `url(${getCurrentBackgroundImage()})` } : undefined}
        >
          {isLoadingMessages && (
            <div className="absolute inset-0 flex items-center justify-center bg-portal-bg/50 z-10">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
              </div>
            </div>
          )}
          {/* Load More Messages Button */}
          {hasMoreMessages && (
            <div className="flex justify-center">
              <button
                onClick={loadMoreMessages}
                disabled={loadingMoreMessages}
                className="px-4 py-2 text-sm text-portal-soft bg-portal-surface2 hover:bg-portal-surface2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMoreMessages ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}
          {messages.map((msg, msgIndex) => {
            const isCurrentUser = msg.senderId === currentUser.id && !msg.isAi;
            const prevMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
            const isGrouped = !!(prevMsg &&
              prevMsg.senderId === msg.senderId &&
              !msg.isAi && !prevMsg.isAi &&
              (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 5 * 60 * 1000);
            const isThinking = msg.isAi && msg.text === '⏳ Echo is thinking…';

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`flex group ${isCurrentUser ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-0.5' : 'mt-3'}`}
              >
                {/* Left avatar for non-current-user */}
                {!isCurrentUser && (
                  <div className="flex-shrink-0 mr-2">
                    {!isGrouped ? (
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center ${msg.isAi ? 'bg-brand-500' : 'bg-portal-surface2'}`}>
                        {msg.isAi ? (
                          <Bot className="w-4 h-4 md:w-6 md:h-6 text-white" />
                        ) : msg.avatar && msg.avatar !== 'user' && msg.avatar.startsWith('http') ? (
                          <img src={msg.avatar} alt="" className="w-full h-full rounded-lg object-cover" />
                        ) : (
                          <UserIcon className="w-4 h-4 md:w-6 md:h-6 text-portal-soft" />
                        )}
                      </div>
                    ) : (
                      <div className="w-8 md:w-10" />
                    )}
                  </div>
                )}

                {/* Bubble column */}
                <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'} max-w-[78%]`}>
                  {/* Sender name + timestamp (first in group only) */}
                  {!isGrouped && (
                    <div className={`flex items-baseline gap-1 md:gap-2 mb-1 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                      <span className={`font-semibold text-sm ${msg.isAi ? 'text-brand-400' : 'text-portal-soft'}`}>
                        {isCurrentUser ? 'You' : msg.sender}
                      </span>
                      <span className="text-[10px] text-portal-soft/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        {formatMessageTime(msg.timestamp)}
                        {msg.isEdited && <span className="ml-1 italic">(edited)</span>}
                      </span>
                    </div>
                  )}

                  {/* Attachment */}
                  {msg.attachmentUrl && (
                    <div className="mb-1.5">
                      {msg.attachmentType === 'image' ? (
                        <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                          <img src={msg.attachmentUrl} alt="Attachment" className="max-h-48 md:max-h-60 rounded-xl border border-white/[0.07]" />
                        </a>
                      ) : msg.attachmentType === 'video' ? (
                        <video
                          src={msg.attachmentUrl}
                          controls
                          className="max-h-64 md:max-h-80 rounded-xl border border-white/[0.07]"
                          preload="metadata"
                        />
                      ) : (
                        <a
                          href={msg.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-3 px-4 py-3 bg-portal-surface2 rounded-xl border border-white/[0.07] transition-colors"
                        >
                          <div className="p-2 bg-portal-surface rounded-lg shadow-sm">
                            <File className="w-5 h-5 text-brand-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-portal-text truncate max-w-[200px]">
                              {msg.attachmentName || 'File attachment'}
                            </p>
                            <p className="text-xs text-portal-soft">Click to download</p>
                          </div>
                          <Download className="w-4 h-4 text-portal-soft group-hover:text-brand-600 transition-colors" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Edit form or bubble */}
                  {editingMessageId === msg.id ? (
                    <div className="w-full space-y-2">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full p-2 text-xs md:text-sm border border-white/[0.07] rounded-lg focus:ring-2 focus:ring-brand-500 outline-none resize-none bg-white text-slate-900"
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
                          className="flex items-center gap-1 px-3 py-1 bg-portal-surface2 text-portal-text text-sm rounded-lg transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        className={`relative px-3.5 py-2.5 rounded-2xl text-sm md:text-base ${
                          isCurrentUser
                            ? 'bg-brand-600 text-white rounded-tr-sm'
                            : msg.isAi
                            ? 'bg-brand-500/10 border border-brand-500/20 text-portal-text rounded-tl-sm'
                            : 'bg-portal-surface2 text-portal-text rounded-tl-sm'
                        }`}
                      >
                        {isThinking ? (
                          <div className="flex items-center gap-1.5 py-0.5">
                            <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" />
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap">{renderTextWithMentions(msg.text)}</span>
                        )}
                        {/* Hover action buttons */}
                        {!isThinking && (
                          <div className={`absolute top-1 ${isCurrentUser ? 'right-full mr-1' : 'left-full ml-1'} hidden group-hover:flex items-center gap-0.5 bg-portal-surface border border-white/[0.07] rounded-lg px-1 py-0.5 shadow-lg z-10`}>
                            {!msg.isAi && msg.senderId === currentUser.id && (
                              <button
                                onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.text); }}
                                className="p-1 text-portal-soft hover:text-brand-500 transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!msg.isAi && (currentUser.role === 'Owner' || msg.senderId === currentUser.id) && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id, msg.text)}
                                className="p-1 text-portal-soft hover:text-red-500 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!msg.isAi && (
                              <button
                                onClick={() => msg.isPinned ? handleUnpinMessage(msg.id) : handlePinMessage(msg.id)}
                                className={`p-1 transition-colors ${msg.isPinned ? 'text-amber-500 hover:text-portal-soft' : 'text-portal-soft hover:text-amber-500'}`}
                                title={msg.isPinned ? 'Unpin' : 'Pin'}
                              >
                                {msg.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            {!msg.isAi && (
                              <button
                                onClick={() => setReplyingToMessage(msg)}
                                className="p-1 text-portal-soft hover:text-brand-500 transition-colors"
                                title="Reply"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {msg.isPinned && (
                        <span className="absolute -top-1.5 -right-1.5 text-amber-500" title="Pinned">
                          <Pin className="w-3 h-3" />
                        </span>
                      )}
                      {msg.taskLink && renderTaskLinkCard(msg.taskLink)}
                    </div>
                  )}

                  {/* Reactions */}
                  <div className={`mt-1.5 flex flex-wrap items-center gap-1 ${isCurrentUser ? 'justify-end' : ''}`}>
                    {(messageReactions[msg.id] || []).map((reaction) => (
                      <button
                        key={reaction.emoji}
                        onClick={() => handleReaction(msg.id, reaction.emoji)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-all ${
                          reaction.userIds.includes(currentUser.id)
                            ? 'bg-brand-100 border-brand-300 border-2'
                            : 'bg-portal-surface2 border border-white/[0.07] hover:bg-portal-surface2'
                        }`}
                        title={reaction.userIds
                          .map(uid => {
                            if (uid === currentUser.id) return 'You';
                            const profile = profiles.find(p => p.id === uid);
                            return profile?.full_name || 'Unknown';
                          })
                          .join(', ')}
                      >
                        <span>{reaction.emoji}</span>
                        <span className="text-xs font-medium text-portal-soft">
                          {reaction.userIds
                            .map(uid => {
                              if (uid === currentUser.id) return 'You';
                              const profile = profiles.find(p => p.id === uid);
                              return profile?.full_name?.split(' ')[0] || 'Unknown';
                            })
                            .join(', ')}
                        </span>
                      </button>
                    ))}
                    {!msg.isAi && (
                      <div className="relative">
                        <button
                          onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-portal-surface2 border border-white/[0.07] transition-opacity"
                          title="Add reaction"
                        >
                          <SmilePlus className="w-4 h-4" />
                        </button>
                        {showReactionPicker === msg.id && (
                          <div className={`absolute ${isCurrentUser ? 'right-0' : 'left-0'} bottom-full mb-2 bg-portal-surface rounded-lg shadow-xl border border-white/[0.07] p-2 z-50 flex gap-1`}>
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

                  {/* Thread Replies */}
                  {(msg.replyCount ?? 0) > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggleThreadExpansion(msg.id)}
                        className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span className="font-medium">
                          {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
                        </span>
                        {expandedThreads.has(msg.id) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {expandedThreads.has(msg.id) && (
                        <div className="mt-3 ml-4 pl-4 border-l-2 border-brand-200 space-y-3">
                          {loadingThreads.has(msg.id) ? (
                            <div className="flex items-center gap-2 text-sm text-portal-soft">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading replies...
                            </div>
                          ) : (
                            <>
                              {(threadReplies[msg.id] || []).map((reply) => (
                                <div key={reply.id} className="flex gap-2">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${reply.isAi ? 'bg-brand-500' : 'bg-portal-surface2'}`}>
                                    {reply.isAi ? (
                                      <Bot className="w-3 h-3 text-white" />
                                    ) : reply.avatar && reply.avatar !== 'user' && reply.avatar.startsWith('http') ? (
                                      <img src={reply.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                      <UserIcon className="w-3 h-3 text-portal-soft" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                      <span className="font-semibold text-sm text-white">{reply.sender}</span>
                                      <span className="text-[10px] text-portal-soft">
                                        {formatMessageTime(reply.timestamp)}
                                        {reply.isEdited && <span className="ml-1 italic">(edited)</span>}
                                      </span>
                                    </div>
                                    {reply.attachmentUrl && (
                                      <div className="mt-1 mb-1">
                                        {reply.attachmentType === 'image' ? (
                                          <a href={reply.attachmentUrl} target="_blank" rel="noopener noreferrer">
                                            <img src={reply.attachmentUrl} alt="Attachment" className="max-h-32 rounded-lg border border-white/[0.07]" />
                                          </a>
                                        ) : (
                                        <a href={reply.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline">
                                          {reply.attachmentName || 'Attachment'}
                                        </a>
                                      )}
                                    </div>
                                  )}
                                  <p className={`text-sm whitespace-pre-wrap ${isDarkBackground() ? 'text-slate-200' : 'text-portal-text'}`}>
                                    {renderTextWithMentions(reply.text)}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {/* Reply in thread button */}
                            <button
                              onClick={() => setReplyingToMessage(msg)}
                              className="flex items-center gap-1 text-xs text-portal-soft hover:text-brand-600 transition-colors"
                            >
                              <Reply className="w-3 h-3" />
                              Reply
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          })}
          {loading && <div className="text-sm text-portal-soft italic px-6">Echo is typing...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-2 md:p-6 md:pt-2 flex-shrink-0 bg-portal-surface border-t border-white/[0.07]">
          <div className="border rounded-lg md:rounded-xl shadow-sm bg-portal-surface flex flex-col relative border-white/[0.07]">
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
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-portal-surface rounded-lg shadow-xl border border-white/[0.07] overflow-hidden z-[100] animate-fadeIn">
                <div className="p-2 bg-portal-dark border-b border-white/[0.07]">
                  <p className="text-xs font-bold text-portal-soft uppercase">Mention Someone</p>
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
                        <p className="font-medium text-white">@everyone</p>
                        <p className="text-xs text-portal-soft">Notify all team members</p>
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
                          <p className="font-medium text-white">{profile.full_name || 'Unknown'}</p>
                          <p className="text-xs text-portal-soft">@{profile.full_name?.split(' ')[0] || 'user'}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
              );
            })()}

            {/* Reply banner - shows when replying to a message */}
            {replyingToMessage && (
              <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border-b border-brand-200">
                <Reply className="w-4 h-4 text-brand-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-brand-600">
                    Replying to <span className="font-semibold">{replyingToMessage.sender}</span>
                  </span>
                  <p className="text-xs text-portal-soft truncate">
                    {replyingToMessage.text.substring(0, 60)}{replyingToMessage.text.length > 60 ? '...' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setReplyingToMessage(null)}
                  className="p-1 text-portal-soft hover:text-portal-soft transition-colors"
                  title="Cancel reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Staged attachment preview */}
            {stagedAttachment && (
              <div className="relative p-2 bg-portal-surface2 border-b border-white/[0.07]">
                <div className="flex items-start gap-2">
                  {stagedAttachment.type === 'image' ? (
                    <img
                      src={stagedAttachment.url}
                      alt="Attachment preview"
                      className="max-h-32 max-w-[200px] rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-portal-surface rounded-lg">
                      <File className="w-5 h-5 text-portal-soft" />
                      <span className="text-sm text-portal-text">{stagedAttachment.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setStagedAttachment(null)}
                    className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
              className="w-full max-h-40 min-h-[44px] md:min-h-[60px] p-2 md:p-3 text-sm md:text-base outline-none resize-none rounded-t-lg md:rounded-t-xl bg-white text-slate-900 placeholder-slate-400"
            />
            <div className="flex justify-between items-center p-1.5 md:p-2 border-t rounded-b-lg md:rounded-b-xl bg-portal-dark border-white/[0.07]">
              <div className="flex gap-0.5 md:gap-1 relative">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar" />
                <button onClick={() => fileInputRef.current?.click()} className="p-1.5 md:p-2 hover:bg-portal-surface2 rounded-full text-portal-soft" title="Attach file">
                  <Paperclip className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                <button
                  onClick={() => {
                    setShowEmojiPicker(!showEmojiPicker);
                    setShowGifPicker(false);
                  }}
                  className="p-1.5 md:p-2 hover:bg-portal-surface2 rounded-full text-portal-soft"
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
                  className="hidden sm:block p-1.5 md:p-2 hover:bg-portal-surface2 rounded-full text-portal-soft"
                >
                  <Film className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-portal-surface rounded-lg shadow-xl border border-white/[0.07] p-2 md:p-3 z-[100] w-72 md:w-80">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/[0.07]">
                      <p className="text-sm font-bold text-portal-text">Emojis</p>
                      <button onClick={() => setShowEmojiPicker(false)} className="text-portal-soft hover:text-portal-soft">
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
                          className="text-2xl hover:bg-portal-surface2 rounded p-1 transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* GIF Picker Dropdown */}
                {showGifPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-portal-surface rounded-lg shadow-xl border border-white/[0.07] p-2 md:p-3 z-[100] w-80 md:w-96">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/[0.07]">
                      <p className="text-sm font-bold text-portal-text">GIFs</p>
                      <button onClick={() => setShowGifPicker(false)} className="text-portal-soft hover:text-portal-soft">
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
                        className="w-full px-3 py-2 text-sm border border-white/[0.07] rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white text-slate-900 placeholder-slate-400"
                      />
                    </div>
                    {gifLoading ? (
                      <div className="flex justify-center items-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                      </div>
                    ) : gifs.length === 0 ? (
                      <div className="flex justify-center items-center h-64 text-portal-soft">
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
        </>
        )}
      </div>

      {/* Members Management Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1a1d29] rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white text-lg font-semibold">Manage Channel Members</h3>
              <button onClick={() => setShowMembersModal(false)} className="text-portal-soft hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-portal-soft" />
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h4 className="text-portal-text text-sm font-medium mb-2">Current Members</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {channelMembers.map((member: any) => (
                      <div key={member.id} className="flex items-center justify-between bg-[#2d3142] rounded p-2">
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-portal-soft" />
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
                  <h4 className="text-portal-text text-sm font-medium mb-2">Invite Members</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {profiles
                      .filter(p => !channelMembers.some((m: any) => m.user_id === p.id))
                      .map(profile => (
                        <div key={profile.id} className="flex items-center justify-between bg-[#2d3142] rounded p-2">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-portal-soft" />
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
      {/* Todo List Popup */}
      {showTodoList && (
        <ChatTodoList
          currentUser={currentUser}
          addToast={addToast}
          onClose={() => setShowTodoList(false)}
        />
      )}
    </div>
  );
};

export default TeamChat;
