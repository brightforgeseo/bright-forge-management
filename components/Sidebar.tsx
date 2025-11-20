
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Search, PenTool, BarChart, Settings, TableProperties, MessageSquare, Hexagon, LogOut, UserPlus, MoreVertical, Bell, X, Check, CheckSquare } from 'lucide-react';
import { ToolView, BrandingConfig, User, AppNotification } from '../types';
import { supabase } from '../lib/supabaseClient';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../services/databaseService';

interface SidebarProps {
  currentView: ToolView;
  onChangeView: (view: ToolView) => void;
  branding: BrandingConfig;
  currentUser: User;
  onLogout: () => void;
  onInvite: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onChangeView, 
  branding, 
  currentUser, 
  onLogout,
  onInvite
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Play notification sound - LOUD bell sound
  const playNotificationSound = async () => {
    try {
      // Check if audio is allowed (user interaction or permission)
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        console.warn('Web Audio API not supported');
        return;
      }

      const audioContext = new AudioContext();

      // Resume context if suspended (Chrome autoplay policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Create a more pleasant notification sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Use a sine wave for a softer sound
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
      oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.15); // Drop to A4

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Envelope for a quick bell-like sound
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3); // Decay

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Clean up after sound finishes
      oscillator.onended = () => {
        audioContext.close();
      };

      console.log('🔔 Notification sound played successfully');
    } catch (error) {
      console.warn('Could not play notification sound:', error);
      // Fallback: Try to use HTML5 audio if available
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCCuBzvLZiTcIG2m98OScTgwOUavnzbllHAUyjN3w0');
        audio.volume = 0.3;
        audio.play();
      } catch (fallbackError) {
        console.warn('Fallback audio also failed:', fallbackError);
      }
    }
  };

  // Notification listener
  useEffect(() => {
      if (!currentUser || currentUser.id === 'guest') return;

      const loadNotifications = async () => {
          const data = await fetchNotifications(currentUser.id);
          setNotifications(data);
      };
      loadNotifications();

      // Subscribe to new notifications
      const sub = supabase.channel('public:notifications')
          .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${currentUser.id}`
          }, (payload) => {
              const newNote = payload.new as any;
              console.log('🔔 New notification received!', newNote);

              setNotifications(prev => [{
                  id: newNote.id,
                  userId: newNote.user_id,
                  title: newNote.title,
                  message: newNote.message,
                  type: newNote.type,
                  linkView: newNote.link_view,
                  linkData: newNote.link_data,
                  isRead: newNote.is_read,
                  createdAt: newNote.created_at
              }, ...prev]);

              // Play notification sound
              playNotificationSound();
          })
          .subscribe();

      return () => { supabase.removeChannel(sub); };
  }, [currentUser.id]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkRead = async (id: string) => {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleMarkAllRead = async () => {
      await markAllNotificationsRead(currentUser.id);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const navItems = [
    { id: ToolView.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ToolView.KEYWORD_RESEARCH, label: 'Keyword Research', icon: Search },
    { id: ToolView.CONTENT_GENERATOR, label: 'Content Generator', icon: PenTool },
    { id: ToolView.SITE_AUDIT, label: 'SEO Audit', icon: BarChart },
    { id: ToolView.TASKS, label: 'Project Tasks', icon: TableProperties },
    { id: ToolView.MY_WORK, label: 'My Work', icon: CheckSquare },
    { id: ToolView.TEAM_CHAT, label: 'Team Chat', icon: MessageSquare },
    { id: ToolView.SETTINGS, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-full fixed left-0 top-0 shadow-xl z-10 transition-all duration-300">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 flex-shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg flex items-center justify-center shadow-lg shadow-brand-900/50">
               <Hexagon className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-slate-100 truncate">{branding.companyName}</h1>
        </div>
        
        {/* Notification Bell */}
        <div className="relative">
            <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 rounded-lg hover:bg-slate-800 transition-colors relative"
                style={unreadCount > 0 ? {
                  boxShadow: '0 0 25px rgba(251, 146, 60, 1), 0 0 50px rgba(251, 146, 60, 0.6), 0 0 75px rgba(251, 146, 60, 0.3)',
                  animation: 'glow 1.5s ease-in-out infinite',
                  backgroundColor: 'rgba(251, 146, 60, 0.1)'
                } : {}}
            >
                <Bell
                  className={`w-5 h-5 transition-colors ${unreadCount > 0 ? 'text-orange-500' : 'text-slate-400 hover:text-white'}`}
                  style={unreadCount > 0 ? { filter: 'drop-shadow(0 0 8px rgba(251, 146, 60, 0.8))' } : {}}
                />
                {unreadCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full border-2 border-slate-900 flex items-center justify-center px-1"
                      style={{
                        boxShadow: '0 0 15px rgba(251, 146, 60, 0.8)',
                        animation: 'pulse 1s ease-in-out infinite'
                      }}
                    >
                        {unreadCount}
                    </span>
                )}
            </button>

            {isNotificationsOpen && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)}></div>
                <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-fadeIn text-slate-900 left-0 md:left-auto md:right-[-200px] lg:left-0 origin-top-left">
                   <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                       <h3 className="font-bold text-sm text-slate-700">Notifications</h3>
                       <div className="flex gap-2">
                           {unreadCount > 0 && (
                               <button onClick={handleMarkAllRead} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Mark all read</button>
                           )}
                           {notifications.length > 0 && (
                               <button
                                 onClick={async () => {
                                   if (confirm('Clear all notifications?')) {
                                     // Delete all notifications for this user
                                     await supabase.from('notifications').delete().eq('user_id', currentUser.id);
                                     setNotifications([]);
                                   }
                                 }}
                                 className="text-xs text-red-600 hover:text-red-700 font-medium"
                               >
                                 Clear all
                               </button>
                           )}
                       </div>
                   </div>
                   <div className="max-h-80 overflow-y-auto">
                       {notifications.length === 0 ? (
                           <div className="p-8 text-center text-slate-400 text-sm">No notifications</div>
                       ) : (
                           notifications.map(n => (
                               <div 
                                 key={n.id} 
                                 className={`p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                                 onClick={() => {
                                     if(!n.isRead) handleMarkRead(n.id);
                                     if(n.linkView) {
                                       onChangeView(n.linkView as ToolView);
                                       setIsNotificationsOpen(false); // Close dropdown after clicking

                                       // If there's link data (task/board info), store it for TaskBoard to open
                                       if (n.linkData) {
                                         try {
                                           const linkData = JSON.parse(n.linkData);
                                           console.log('📍 Storing link data for task modal:', linkData);
                                           localStorage.setItem('openTaskModal', n.linkData);
                                         } catch (e) {
                                           console.error('Error parsing link data:', e);
                                         }
                                       }
                                     }
                                 }}
                               >
                                  <div className="flex justify-between items-start gap-2">
                                      <div>
                                          <p className={`text-sm ${!n.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{n.title}</p>
                                          <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.message}</p>
                                          <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleTimeString()} · {new Date(n.createdAt).toLocaleDateString()}</p>
                                      </div>
                                      {!n.isRead && <div className="w-2 h-2 bg-brand-500 rounded-full mt-1.5"></div>}
                                  </div>
                               </div>
                           ))
                       )}
                   </div>
                </div>
                </>
            )}
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-900/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
        
        {/* Invite Button - Moved to main nav as requested */}
        {currentUser.role === 'Owner' && (
            <div className="pt-4 pb-2">
                <div className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Team Management</div>
                <button 
                    onClick={onInvite}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600 hover:text-white group"
                >
                    <UserPlus className="w-5 h-5 text-blue-500 group-hover:text-white" />
                    <span className="font-medium text-sm">Invite Team Member</span>
                </button>
            </div>
        )}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-4">
        {/* User Profile */}
        <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center gap-3 p-2 hover:bg-slate-800 rounded-lg transition-colors group"
            >
              {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-brand-400" />
              ) : (
                  <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white border border-brand-400 shadow-sm">
                    {currentUser.initials}
                  </div>
              )}
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-medium text-slate-200 truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-500 truncate">{currentUser.role}</p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
            </button>
            
            {/* Profile Menu */}
            {isProfileOpen && (
              <>
              <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)}></div>
              <div className="absolute bottom-full left-0 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl mb-2 overflow-hidden z-20 animate-fadeIn">
                 <div className="p-3 border-b border-slate-700">
                    <p className="text-xs text-slate-400">Signed in as</p>
                    <p className="text-sm font-medium text-white truncate">{currentUser.email}</p>
                 </div>
                 <button 
                    onClick={onLogout}
                    className="w-full text-left p-3 text-sm flex items-center gap-2 hover:bg-red-900/20 text-red-400 hover:text-red-300 transition-colors"
                 >
                    <LogOut className="w-4 h-4" /> Log Out
                 </button>
              </div>
              </>
            )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;