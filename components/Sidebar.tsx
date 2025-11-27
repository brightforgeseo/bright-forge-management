
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Search, PenTool, BarChart, Settings, TableProperties, MessageSquare, Hexagon, LogOut, UserPlus, MoreVertical, Bell, X, Check, CheckSquare, Menu } from 'lucide-react';
import { ToolView, BrandingConfig, User, AppNotification } from '../types';
import { supabase } from '../lib/supabaseClient';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteAllNotifications, deleteNotification } from '../services/databaseService';
import { version } from '../package.json';

// Flash favicon when receiving notifications
let faviconFlashInterval: ReturnType<typeof setInterval> | null = null;
let originalFaviconHref: string | null = null;
const notificationFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23f97316"/><text x="50" y="70" font-size="60" text-anchor="middle" fill="white">!</text></svg>';

const startFaviconFlash = () => {
  // Don't start if already flashing
  if (faviconFlashInterval) return;

  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) return;

  // Store original favicon on first flash
  if (!originalFaviconHref) {
    originalFaviconHref = favicon.href;
  }

  let isOriginal = true;
  faviconFlashInterval = setInterval(() => {
    favicon.href = isOriginal ? notificationFavicon : originalFaviconHref!;
    isOriginal = !isOriginal;
  }, 500);

  // Stop flashing when window gains focus
  const stopFlashing = () => {
    if (faviconFlashInterval) {
      clearInterval(faviconFlashInterval);
      faviconFlashInterval = null;
      if (originalFaviconHref) favicon.href = originalFaviconHref;
    }
    window.removeEventListener('focus', stopFlashing);
  };

  window.addEventListener('focus', stopFlashing);

  // Also stop after 30 seconds max
  setTimeout(() => {
    if (faviconFlashInterval) {
      stopFlashing();
    }
  }, 30000);
};

// Play notification sound when receiving notifications
const playNotificationSound = async () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const oscillator3 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator1.frequency.value = 800;
    oscillator2.frequency.value = 1000;
    oscillator3.frequency.value = 1200;

    oscillator1.type = 'sine';
    oscillator2.type = 'sine';
    oscillator3.type = 'sine';

    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    oscillator3.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime + 0.1);
    oscillator3.start(audioContext.currentTime + 0.2);

    oscillator1.stop(audioContext.currentTime + 0.3);
    oscillator2.stop(audioContext.currentTime + 0.4);
    oscillator3.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
};

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
      // Request permission immediately for better UX
      Notification.requestPermission().then(permission => {
        console.log('[Notifications] Browser permission:', permission);
      });
    } else if ('Notification' in window) {
      console.log('[Notifications] Browser permission already:', Notification.permission);
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

        // Show native browser/OS notification (works even when tab is not focused)
        if (window.electronAPI?.showNotification) {
          // Electron app
          window.electronAPI.showNotification(newNote.title, newNote.message);
        } else if ('Notification' in window && Notification.permission === 'granted') {
          // Web browser - show native notification like Slack/Monday
          const notification = new Notification(newNote.title, {
            body: newNote.message,
            icon: '/vite.svg',
            tag: newNote.id, // Prevent duplicate notifications
            requireInteraction: false,
            silent: false // Allow system sound
          });

          // Click notification to focus the app
          notification.onclick = () => {
            window.focus();
            notification.close();
          };

          // Auto-close after 5 seconds
          setTimeout(() => notification.close(), 5000);
        }

        // Play in-app notification sound
        playNotificationSound();

        // Flash favicon if window is not focused
        if (!document.hasFocus()) {
          startFaviconFlash();
        }
      })
      .subscribe((status) => {
        console.log('[Notifications] Realtime subscription status:', status);
      });

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

  const handleDeleteNotification = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation(); // Prevent triggering the notification click
    await deleteNotification(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
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
          // Dispatch custom event for same-tab detection
          window.dispatchEvent(new CustomEvent('openTaskModal', { detail: linkData }));
        }

        // Handle chat notifications (DMs and mentions)
        if (notification.linkView === 'TEAM_CHAT' && linkData.channelId) {
          console.log('[Sidebar] Setting openChatNotification:', linkData);
          localStorage.setItem('openChatNotification', JSON.stringify(linkData));
        }

        // Handle MY_WORK task notifications
        if (notification.linkView === 'MY_WORK' && linkData.taskId) {
          console.log('[Sidebar] Setting openMyWorkTask:', linkData);
          localStorage.setItem('openMyWorkTask', JSON.stringify(linkData));
          window.dispatchEvent(new CustomEvent('openMyWorkTask', { detail: linkData }));
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
      <div className="p-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
            <div className="w-7 h-7 flex-shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg flex items-center justify-center shadow-lg shadow-brand-900/50">
               <Hexagon className="w-4 h-4 text-white" fill="currentColor" />
            </div>
            <h1 className="font-bold text-base tracking-tight text-slate-100 truncate">{branding.companyName}</h1>
        </div>

        {/* Notification Bell */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors relative"
          >
            <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'text-orange-500' : 'text-slate-400'}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-orange-500 text-white text-[9px] font-bold rounded-full border-2 border-slate-900 flex items-center justify-center px-0.5">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel - Dropdown */}
          {isNotificationsOpen && (
            <>
              <div className="fixed inset-0" style={{ zIndex: 10000 }} onClick={() => setIsNotificationsOpen(false)}></div>
              <div className="fixed top-14 left-[270px] w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 max-h-[calc(100vh-4rem)]" style={{ zIndex: 10001 }}>
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
                        className={`p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{n.title}</p>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {new Date(n.createdAt).toLocaleTimeString()} · {new Date(n.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!n.isRead && <div className="w-2 h-2 bg-brand-500 rounded-full"></div>}
                            <button
                              onClick={(e) => handleDeleteNotification(e, n.id)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                              title="Delete notification"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto min-h-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleViewChange(item.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-900/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="font-medium text-sm truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Invite Button - Moved to main nav as requested */}
        {currentUser.role === 'Owner' && (
            <div className="pt-2">
                <div className="px-2 text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Team</div>
                <button
                    onClick={onInvite}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-200 bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600 hover:text-white group"
                >
                    <UserPlus className="w-4 h-4 flex-shrink-0 text-blue-500 group-hover:text-white" />
                    <span className="font-medium text-sm truncate">Invite Member</span>
                </button>
            </div>
        )}
      </nav>

      <div className="p-2 border-t border-slate-800 flex-shrink-0">
        {/* User Profile */}
        <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center gap-2 p-1.5 hover:bg-slate-800 rounded-lg transition-colors group"
            >
              {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-brand-400 flex-shrink-0" />
              ) : (
                  <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-[10px] font-bold text-white border border-brand-400 shadow-sm flex-shrink-0">
                    {currentUser.initials}
                  </div>
              )}
              <div className="flex-1 text-left overflow-hidden min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{currentUser.role}</p>
              </div>
              <MoreVertical className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
            </button>

            {/* Profile Menu */}
            {isProfileOpen && (
              <>
              <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)}></div>
              <div className="absolute bottom-full left-0 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl mb-2 overflow-hidden z-20 animate-fadeIn">
                 <div className="p-2.5 border-b border-slate-700">
                    <p className="text-[10px] text-slate-400">Signed in as</p>
                    <p className="text-xs font-medium text-white truncate">{currentUser.email}</p>
                 </div>
                 <button
                    onClick={onLogout}
                    className="w-full text-left p-2.5 text-xs flex items-center gap-2 hover:bg-red-900/20 text-red-400 hover:text-red-300 transition-colors"
                 >
                    <LogOut className="w-3.5 h-3.5" /> Log Out
                 </button>
              </div>
              </>
            )}
        </div>

        {/* Version Number */}
        <div className="text-center pt-1">
          <span className="text-[10px] text-slate-600">v{version}</span>
        </div>
      </div>
    </div>
    </>
  );
};

export default Sidebar;