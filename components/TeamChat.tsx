import React, { useState, useEffect, useRef } from 'react';
import { Hash, Plus, Trash2, Image as ImageIcon, Send, Bot, User as UserIcon, Loader2, FileText, Users, MessageSquare, RefreshCw } from 'lucide-react';
import { ChatChannel, ChatMessage, User, ToastType, Profile } from '../types';
import { getChatResponse } from '../services/geminiService';
import { fetchChatMessages, sendChatMessage, clearChatHistory, uploadFile, fetchChannels, createChannel, deleteChannel, fetchProfiles, getOrCreateDMChannel, createNotification } from '../services/databaseService';
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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChannelRef = useRef<string>(''); 
  const channelsRef = useRef<ChatChannel[]>([]);
  const profilesRef = useRef<Profile[]>([]);

  // Sync Refs for listeners to avoid dependency loops
  useEffect(() => {
      channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
      profilesRef.current = profiles;
  }, [profiles]);

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
      if (ch.type !== 'dm') return { name: ch.name, avatar: null };
      const ids = parseDMChannel(ch.name);
      const otherId = ids.find(id => id !== currentUser.id);
      
      if (!otherId) {
          // Self-DM or malformed
          return { name: 'You', avatar: currentUser.avatarUrl };
      }
      
      const prof = profiles.find(p => p.id === otherId);
      return {
          name: prof?.full_name || prof?.email?.split('@')[0] || 'Unknown User',
          avatar: prof?.avatar_url || null
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
    const msgSub = supabase.channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
         const newMsg = payload.new as any;
         
         // 1. Is this for the channel I'm looking at?
         if (newMsg.channel_id === activeChannelRef.current) {
             setMessages(prev => {
                 // Prevent duplicates
                 if (prev.some(m => m.id === newMsg.id)) return prev;
                 return [...prev, {
                     id: newMsg.id,
                     channelId: newMsg.channel_id,
                     sender: newMsg.sender,
                     text: newMsg.text,
                     timestamp: newMsg.created_at,
                     isAi: newMsg.is_ai,
                     avatar: newMsg.avatar,
                     attachmentUrl: newMsg.attachment_url,
                     attachmentType: newMsg.attachment_type
                 }];
             });
             scrollToBottom();
         } else {
             // 2. It's for a different channel
             let targetChannel = channelsRef.current.find(c => c.id === newMsg.channel_id);
             
             // CRITICAL FIX: If we don't know about this channel, fetch all channels
             if (!targetChannel) {
                 const updatedChannels = await fetchChannels();
                 setChannels(updatedChannels);
                 targetChannel = updatedChannels.find(c => c.id === newMsg.channel_id);
             }

             // 3. Notify appropriately
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
                 
                 // Update unread count
                 setChannels(prev => prev.map(c => 
                     c.id === targetChannel?.id ? { ...c, unread: (c.unread || 0) + 1 } : c
                 ));
             }
         }
      })
      .subscribe();

    return () => { supabase.removeChannel(msgSub); };
  }, [currentUser.id, currentUser.name]);

  // Active Channel Switch
  useEffect(() => {
    if (!activeChannelId) return;
    activeChannelRef.current = activeChannelId;

    const loadMsgs = async () => {
      const msgs = await fetchChatMessages(activeChannelId);
      setMessages(msgs);
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
      if (!window.confirm("Delete this channel and all messages?")) return;
      try {
          await deleteChannel(id);
          // If we deleted the active channel, fall back
          if (activeChannelId === id) {
             const general = channels.find(c => c.name === 'general' && c.id !== id);
             setActiveChannelId(general ? general.id : (channels.find(c => c.id !== id)?.id || ''));
          }
          addToast('info', 'Channel deleted');
      } catch (e) {
          addToast('error', 'Failed to delete');
      }
  };

  // Direct Messaging - Improved with retry logic
  const handleStartDM = async (targetProfileId: string) => {
      try {
          // Create or get DM channel
          const dmChannel = await getOrCreateDMChannel(currentUser.id, targetProfileId);
          
          // Ensure it's in our local state
          setChannels(prev => {
              if (prev.find(c => c.id === dmChannel.id)) return prev;
              return [...prev, dmChannel];
          });
          
          // Switch to it
          setActiveChannelId(dmChannel.id);
      } catch (e) {
          console.error('DM creation error:', e);
          addToast('error', 'Could not start DM. Please try again.');
      }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    const currentCh = channels.find(c => c.id === activeChannelId);
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      channelId: activeChannelId,
      sender: currentUser.name,
      text: message,
      timestamp: new Date().toISOString(),
      avatar: currentUser.avatarUrl || 'user'
    };

    setMessage('');
    
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

  const handlePaste = async (e: React.ClipboardEvent) => {
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
          }
      }
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
  const isChannelReadOnly = activeChannel?.type === 'channel' && activeChannel.name !== 'ask-ai' && currentUser.role !== 'Owner';
  
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
                       onClick={(e) => { e.stopPropagation(); handleDeleteChannel(channel.id); }} 
                       className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400"
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
                        const { name, avatar } = getDMInfo(channel);
                        return (
                            <li 
                                key={channel.id}
                                onClick={() => setActiveChannelId(channel.id)}
                                className={`px-4 py-1 flex items-center gap-2 cursor-pointer mx-2 rounded-md ${activeChannelId === channel.id ? 'bg-[#1164A3] text-white' : 'text-[#bcabbc] hover:bg-[#350d36]'}`}
                            >
                                <div className="relative w-4 h-4 flex-shrink-0">
                                    {avatar ? <img src={avatar} alt="" className="w-4 h-4 rounded-full object-cover" /> : <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center text-[8px] text-white font-bold">{name.charAt(0)}</div>}
                                    {channel.unread ? <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-[#3F0E40]"></div> : null}
                                </div>
                                <span className={`truncate text-sm ${channel.unread ? 'font-bold text-white' : ''}`}>
                                    {name} {channel.unread ? `(${channel.unread})` : ''}
                                </span>
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
                      {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                      ) : (
                          <div className="w-4 h-4 rounded-full bg-slate-500 flex items-center justify-center text-[8px] text-white font-bold">
                             {p.full_name?.charAt(0) || '?'}
                          </div>
                      )}
                      <span className="truncate text-sm flex-1">{p.full_name || p.email?.split('@')[0] || 'Team Member'} {p.id === currentUser.id && '(You)'}</span>
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
          {activeChannelId && <button onClick={() => clearChatHistory(activeChannelId)} title="Clear History"><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-500" /></button>}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
           {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.isAi ? 'bg-brand-50/30 -mx-6 px-6 py-2' : ''}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${msg.isAi ? 'bg-brand-500' : 'bg-slate-200'}`}>
                {msg.isAi ? <Bot className="w-6 h-6 text-white" /> : msg.avatar && msg.avatar !== 'user' && msg.avatar.startsWith('http') ? <img src={msg.avatar} alt="" className="w-full h-full rounded-lg object-cover" /> : <UserIcon className="w-6 h-6 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-slate-900">{msg.sender}</span>
                  <span className="text-xs text-slate-400">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
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
                <div className="text-slate-700 whitespace-pre-wrap mt-1">{msg.text}</div>
              </div>
            </div>
           ))}
           {loading && <div className="text-sm text-slate-400 italic px-6">NexusBot is typing...</div>}
           <div ref={messagesEndRef} />
        </div>

        <div className="p-6 pt-2 flex-shrink-0 bg-white border-t border-slate-100">
           <div className={`border rounded-xl shadow-sm bg-white flex flex-col ${isChannelReadOnly ? 'border-slate-200 bg-slate-50' : 'border-slate-300'}`}>
             <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                onPaste={handlePaste}
                disabled={isChannelReadOnly}
                placeholder={
                    isChannelReadOnly 
                    ? "Only the Owner can post in this channel." 
                    : activeChannel?.type === 'dm' 
                        ? `Message ${getDMInfo(activeChannel!).name}` 
                        : `Message #${activeChannel?.name}`
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