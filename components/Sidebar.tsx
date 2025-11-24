
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Search, PenTool, BarChart, Settings, TableProperties, MessageSquare, Hexagon, LogOut, UserPlus, MoreVertical, Bell, X, Check, CheckSquare, Menu } from 'lucide-react';
import { ToolView, BrandingConfig, User, AppNotification } from '../types';
import { supabase } from '../lib/supabaseClient';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteAllNotifications } from '../services/databaseService';

interface SidebarProps {
  currentView: ToolView;
  onChangeView: (view: ToolView) => void;
  branding: BrandingConfig;
  currentUser: User;
  onLogout: () => void;
  onInvite: () => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onChangeView,
  branding,
  currentUser,
  onLogout,
  onInvite,
  isMobileMenuOpen,
  setIsMobileMenuOpen
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const handleViewChange = (view: ToolView) => {
    onChangeView(view);
    setIsMobileMenuOpen(false);
  };

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.id === 'guest') return;

    const loadNotifications = async () => {
      const data = await fetchNotifications(currentUser.id);
      setNotifications(data);
    };
    loadNotifications();

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUser.id}`
      }, (payload) => {
        const newNote = payload.new as any;
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

        // Show native OS notification (works even when app is in background)
        if (window.electronAPI?.showNotification) {
          window.electronAPI.showNotification(newNote.title, newNote.message);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const handleClearAll = async () => {
    if (!window.confirm('Clear all notifications?')) return;
    await deleteAllNotifications(currentUser.id);
    setNotifications([]);
  };

  const handleNotificationClick = (notification: AppNotification) => {
    console.log('[Sidebar] Notification clicked:', notification);
    console.log('[Sidebar] linkView:', notification.linkView);
    console.log('[Sidebar] linkData:', notification.linkData);
    console.log('[Sidebar] linkData type:', typeof notification.linkData);

    if (!notification.isRead) handleMarkRead(notification.id);
    if (notification.linkView) {
      onChangeView(notification.linkView as ToolView);
      setIsNotificationsOpen(false);

      if (notification.linkData) {
        let linkData;

        // Parse linkData if it's a string
        if (typeof notification.linkData === 'string') {
          try {
            linkData = JSON.parse(notification.linkData);
            console.log('[Sidebar] Parsed linkData from string:', linkData);
          } catch (e) {
            console.error('[Sidebar] Failed to parse linkData:', e);
            return;
          }
        } else {
          linkData = notification.linkData;
          console.log('[Sidebar] Using linkData as object:', linkData);
        }

        // Handle task notifications
        if (notification.linkView === 'TASKS' && linkData.taskId) {
          console.log('[Sidebar] Setting openTaskModal:', linkData);
          localStorage.setItem('openTaskModal', JSON.stringify(linkData));
        }

        // Handle chat notifications (DMs and mentions)
        if (notification.linkView === 'TEAM_CHAT' && linkData.channelId) {
          console.log('[Sidebar] Setting openChatNotification:', linkData);
          localStorage.setItem('openChatNotification', JSON.stringify(linkData));
        }
      } else {
        console.warn('[Sidebar] No linkData found in notification');
      }
    }
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
    <>
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        w-64 bg-slate-900 text-white flex flex-col h-full fixed left-0 top-0 shadow-xl transition-transform duration-300
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ zIndex: 100 }}>
      {/* Brand Header */}
      <div className="p-4 lg:p-6 border-b border-slate-800 flex items-center justify-between">
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
          >
            <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-orange-500' : 'text-slate-400'}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full border-2 border-slate-900 flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel - Dropdown */}
          {isNotificationsOpen && (
            <>
              <div className="fixed inset-0" style={{ zIndex: 10000 }} onClick={() => setIsNotificationsOpen(false)}></div>
              <div className="fixed top-[4.5rem] left-[17rem] w-80 lg:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 max-h-[calc(100vh-6rem)]" style={{ zIndex: 10001 }}>
                <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-sm text-slate-700">Notifications</h3>
                  <div className="flex gap-2">
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                        Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button onClick={handleClearAll} className="text-xs text-red-600 hover:text-red-700 font-medium">
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[500px]">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">No notifications</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        className={`p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <p className={`text-sm ${!n.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{n.title}</p>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {new Date(n.createdAt).toLocaleTimeString()} · {new Date(n.createdAt).toLocaleDateString()}
                            </p>
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
              onClick={() => handleViewChange(item.id)}
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

        {/* Version Number */}
        <div className="text-center">
          <span className="text-xs text-slate-600">v1.0.23</span>
        </div>
      </div>
    </div>
    </>
  );
};

export default Sidebar;