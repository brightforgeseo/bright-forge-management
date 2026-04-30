
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Search, PenTool, BarChart, Settings, TableProperties, MessageSquare, Hexagon, LogOut, UserPlus, MoreVertical, Bell, X, Check, CheckSquare, Menu, FileCheck } from 'lucide-react';
import { ToolView, BrandingConfig, User, AppNotification } from '../types';
import { supabase } from '../lib/supabaseClient';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteAllNotifications, deleteNotification } from '../services/databaseService';
import { version } from '../package.json';
import logoUrl from '../logo';

// Flash favicon when receiving notifications
let faviconFlashInterval: ReturnType<typeof setInterval> | null = null;
let faviconFlashTimeout: ReturnType<typeof setTimeout> | null = null;
let faviconFocusHandler: (() => void) | null = null;
let originalFaviconHref: string | null = null;
const notificationFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23f97316"/><text x="50" y="70" font-size="60" text-anchor="middle" fill="white">!</text></svg>';

// Cleanup function to stop favicon flashing - can be called on component unmount
const stopFaviconFlash = () => {
  if (faviconFlashInterval) {
    clearInterval(faviconFlashInterval);
    faviconFlashInterval = null;
  }
  if (faviconFlashTimeout) {
    clearTimeout(faviconFlashTimeout);
    faviconFlashTimeout = null;
  }
  if (faviconFocusHandler) {
    window.removeEventListener('focus', faviconFocusHandler);
    faviconFocusHandler = null;
  }
  // Restore original favicon
  if (originalFaviconHref) {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) favicon.href = originalFaviconHref;
  }
};

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
  faviconFocusHandler = () => {
    stopFaviconFlash();
  };

  window.addEventListener('focus', faviconFocusHandler);

  // Also stop after 30 seconds max
  faviconFlashTimeout = setTimeout(() => {
    stopFaviconFlash();
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

    let isMounted = true;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const seenIds = new Set<string>();

    // Push a notification into local state + show OS toast + sound + favicon flash.
    // De-duplicates by id so realtime + polling can't double-fire.
    const ingestNotification = (raw: any) => {
      if (!raw || !raw.id) return;
      if (seenIds.has(raw.id)) return;
      seenIds.add(raw.id);

      const note: AppNotification = {
        id: raw.id,
        userId: raw.user_id ?? raw.userId,
        title: raw.title,
        message: raw.message,
        type: raw.type,
        linkView: raw.link_view ?? raw.linkView,
        linkData: raw.link_data ?? raw.linkData,
        isRead: raw.is_read ?? raw.isRead ?? false,
        createdAt: raw.created_at ?? raw.createdAt
      };

      setNotifications(prev => {
        if (prev.some(n => n.id === note.id)) return prev;
        return [note, ...prev];
      });

      // Don't pop OS toast for notifications the user already read (covers polling backfill)
      if (note.isRead) return;

      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification(note.title, note.message);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const browserNote = new Notification(note.title, {
            body: note.message,
            icon: '/vite.svg',
            tag: note.id,
            requireInteraction: false,
            silent: false
          });
          browserNote.onclick = () => {
            window.focus();
            browserNote.close();
          };
          setTimeout(() => browserNote.close(), 5000);
        } catch (e) {
          console.error('[Notifications] OS toast failed:', e);
        }
      }

      playNotificationSound();
      if (!document.hasFocus()) startFaviconFlash();
    };

    // Initial load + seed seenIds so we don't re-pop on first paint.
    const loadNotifications = async () => {
      const data = await fetchNotifications(currentUser.id);
      if (!isMounted) return;
      data.forEach(n => seenIds.add(n.id));
      setNotifications(data);
    };

    // Polling fallback: even if realtime drops we still surface new rows within ~20s.
    const pollForNew = async () => {
      try {
        const data = await fetchNotifications(currentUser.id);
        if (!isMounted) return;
        // Replace state to also pick up reads/deletes from other tabs
        setNotifications(prev => {
          const prevMap = new Map<string, AppNotification>(prev.map(n => [n.id, n]));
          return data.map(n => {
            const existing = prevMap.get(n.id);
            return existing ? { ...existing, ...n } : n;
          });
        });
        // Pop OS toasts for any genuinely new unread rows
        for (const n of data) {
          if (!seenIds.has(n.id) && !n.isRead) ingestNotification(n);
          else seenIds.add(n.id);
        }
      } catch (e) {
        console.error('[Notifications] Poll failed:', e);
      }
    };

    const subscribe = () => {
      // Per-user channel name avoids collisions when multiple tabs/users share state
      const channelName = `notifications-${currentUser.id}-${Date.now()}`;
      const ch = supabase
        .channel(channelName)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
          ingestNotification(payload.new);
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
          const updated = payload.new as any;
          setNotifications(prev => prev.map(n => n.id === updated.id ? {
            ...n,
            isRead: updated.is_read,
            title: updated.title,
            message: updated.message
          } : n));
        })
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) {
            setNotifications(prev => prev.filter(n => n.id !== deleted.id));
          }
        })
        .subscribe((status) => {
          console.log('[Notifications] Realtime status:', status, channelName);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Tear down and reconnect with backoff. Polling keeps users covered in the meantime.
            if (!isMounted) return;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (!isMounted) return;
              try { supabase.removeChannel(ch); } catch {}
              activeChannel = null;
              subscribe();
            }, 3000);
          }
          if (status === 'SUBSCRIBED') {
            // Catch any rows that landed during the reconnect gap
            pollForNew();
          }
        });
      activeChannel = ch;
    };

    loadNotifications();
    subscribe();
    // Poll every 20s as a safety net (no realtime / dropped sockets / mobile sleep)
    pollTimer = setInterval(pollForNew, 20000);
    // Also re-check whenever the tab regains focus
    const onFocus = () => pollForNew();
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', onFocus);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (activeChannel) {
        try { supabase.removeChannel(activeChannel); } catch {}
      }
      // Clean up favicon flash resources on unmount
      stopFaviconFlash();
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
    { id: ToolView.QA_CHECKER, label: 'QA Checker', icon: FileCheck },
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
        w-72 lg:w-64 bg-portal-surface text-white flex flex-col h-full fixed left-0 top-0 shadow-xl transition-transform duration-300 ease-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ zIndex: 100 }}>
      {/* Brand Header */}
      <div className="p-3 pt-8 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
            <img src={logoUrl} alt="BrightForge" className="w-[200px] flex-shrink-0" />
        </div>
        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          className="lg:hidden p-2 hover:bg-portal-surface2 rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5 text-portal-soft" />
        </button>

        {/* Notification Bell */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-1.5 rounded-lg hover:bg-portal-surface2 transition-colors relative"
          >
            <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'text-portal-accent' : 'text-portal-soft'}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-portal-accent text-white text-[9px] font-bold rounded-full border-2 border-portal-surface flex items-center justify-center px-0.5">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel - Dropdown (responsive for mobile) */}
          {isNotificationsOpen && (
            <>
              <div className="fixed inset-0" style={{ zIndex: 10000 }} onClick={() => setIsNotificationsOpen(false)}></div>
              <div className="fixed top-14 left-2 right-2 sm:left-auto sm:right-auto sm:left-[270px] w-auto sm:w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 max-h-[calc(100vh-4rem)]" style={{ zIndex: 10001 }}>
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
                    <div className="p-8 text-center text-portal-soft text-sm">No notifications</div>
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
                            <p className="text-xs text-portal-soft line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-portal-soft mt-1">
                              {new Date(n.createdAt).toLocaleTimeString()} · {new Date(n.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!n.isRead && <div className="w-2 h-2 bg-brand-500 rounded-full"></div>}
                            <button
                              onClick={(e) => handleDeleteNotification(e, n.id)}
                              className="p-1 text-portal-soft hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
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

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto min-h-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 lg:py-2 rounded-xl lg:rounded-lg transition-all duration-200 group active:scale-[0.98] ${
                isActive
                  ? 'bg-portal-accent text-white shadow-md shadow-portal-accent/20'
                  : 'text-portal-soft hover:bg-portal-surface2 hover:text-portal-text active:bg-portal-surface2'
              }`}
            >
              <Icon className={`w-5 h-5 lg:w-4 lg:h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-portal-soft group-hover:text-portal-text'}`} />
              <span className="font-medium text-base lg:text-sm truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Invite Button - Moved to main nav as requested */}
        {currentUser.role === 'Owner' && (
            <div className="pt-6 mt-2 border-t border-white/[0.07]">
                <div className="px-3 text-[10px] font-semibold text-portal-soft uppercase tracking-wider mb-2">Team</div>
                <button
                    onClick={onInvite}
                    className="w-full flex items-center gap-3 px-3 py-3 lg:py-2 rounded-xl lg:rounded-lg transition-all duration-200 bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600 hover:text-white active:scale-[0.98] group"
                >
                    <UserPlus className="w-5 h-5 lg:w-4 lg:h-4 flex-shrink-0 text-blue-500 group-hover:text-white" />
                    <span className="font-medium text-base lg:text-sm truncate">Invite Member</span>
                </button>
            </div>
        )}
      </nav>

      <div className="p-2 border-t border-white/[0.07] flex-shrink-0">
        {/* User Profile */}
        <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center gap-2 p-1.5 hover:bg-portal-surface2 rounded-lg transition-colors group"
            >
              {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-portal-accent flex-shrink-0" />
              ) : (
                  <div className="w-7 h-7 rounded-full bg-portal-accent flex items-center justify-center text-[10px] font-bold text-white border border-portal-accent shadow-sm flex-shrink-0">
                    {currentUser.initials}
                  </div>
              )}
              <div className="flex-1 text-left overflow-hidden min-w-0">
                <p className="text-xs font-medium text-portal-text truncate">{currentUser.name}</p>
                <p className="text-[10px] text-portal-soft truncate">{currentUser.role}</p>
              </div>
              <MoreVertical className="w-3.5 h-3.5 text-portal-soft group-hover:text-portal-text flex-shrink-0" />
            </button>

            {/* Profile Menu */}
            {isProfileOpen && (
              <>
              <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)}></div>
              <div className="absolute bottom-full left-0 w-full bg-portal-surface2 border border-white/[0.07] rounded-xl shadow-xl mb-2 overflow-hidden z-20 animate-fadeIn">
                 <div className="p-2.5 border-b border-white/[0.07]">
                    <p className="text-[10px] text-portal-soft">Signed in as</p>
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
          <span className="text-[10px] text-portal-soft">v{version}</span>
        </div>
      </div>
    </div>
    </>
  );
};

export default Sidebar;