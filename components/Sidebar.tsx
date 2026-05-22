
import React, { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Search, PenTool, BarChart, Settings, TableProperties, MessageSquare, Hexagon, LogOut, UserPlus, MoreVertical, Bell, X, Check, CheckSquare, Menu, FileCheck, Zap, ChevronLeft, ChevronRight, Clock, Mail } from 'lucide-react';
import { ToolView, BrandingConfig, User, AppNotification } from '../types';
import { supabase } from '../lib/supabaseClient';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteAllNotifications, deleteNotification } from '../services/databaseService';
import { enableWebPush } from '../lib/pushNotifications';
import { version } from '../package.json';
import logoUrl from '../logo';

// Flash favicon when receiving notifications
let faviconFlashInterval: ReturnType<typeof setInterval> | null = null;
let faviconFlashTimeout: ReturnType<typeof setTimeout> | null = null;
let faviconFocusHandler: (() => void) | null = null;
let originalFaviconHref: string | null = null;
const notificationFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23f97316"/><text x="50" y="70" font-size="60" text-anchor="middle" fill="white">!</text></svg>';
const BEN_USER_IDS = new Set([
  'f9f11222-d2a9-4ae8-a327-8c4621d90b7c',
  'de294f97-3677-43a5-ac1b-54706e29eef0',
]);

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

// Notification sound — uses one shared AudioContext, primed on first user interaction
// so browser autoplay policies don't block it. Falls back silently if AudioContext is
// unavailable (e.g. older browsers or extreme permission settings).
let sharedAudioContext: AudioContext | null = null;
let audioPrimed = false;
let lastNotificationSoundAt = 0;
const NOTIFICATION_SOUND_DEBOUNCE_MS = 3000;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (sharedAudioContext) return sharedAudioContext;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    sharedAudioContext = new Ctor();
    return sharedAudioContext;
  } catch (e) {
    console.error('[Notifications] AudioContext init failed:', e);
    return null;
  }
};

// Resume on first user gesture so autoplay policy doesn't silence the first push.
const primeAudioOnce = () => {
  if (audioPrimed) return;
  audioPrimed = true;
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
};

if (typeof window !== 'undefined') {
  const onFirstGesture = () => {
    primeAudioOnce();
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
  };
  window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
  window.addEventListener('keydown', onFirstGesture, { once: true });
}

const playNotificationSound = async () => {
  try {
    const wallClockNow = Date.now();
    if (wallClockNow - lastNotificationSoundAt < NOTIFICATION_SOUND_DEBOUNCE_MS) return;
    lastNotificationSoundAt = wallClockNow;

    const audioContext = getAudioContext();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
      try { await audioContext.resume(); } catch {}
    }

    const now = audioContext.currentTime;
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator1.frequency.value = 660;
    oscillator2.frequency.value = 880;
    oscillator1.type = 'sine';
    oscillator2.type = 'sine';

    gainNode.gain.setValueAtTime(0.055, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator1.start(now);
    oscillator2.start(now + 0.05);
    oscillator1.stop(now + 0.18);
    oscillator2.stop(now + 0.22);
  } catch (error) {
    console.error('[Notifications] Failed to play sound:', error);
  }
};

interface SidebarProps {
  currentView: ToolView;
  onChangeView: (view: ToolView) => void;
  branding: BrandingConfig;
  currentUser: User;
  onLogout: () => void;
  onInvite: () => void;
  onOpenPalette?: () => void;
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
  onOpenPalette,
  isMobileMenuOpen,
  setIsMobileMenuOpen
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [recentViews, setRecentViews] = useState<ToolView[]>(() => {
    try { return JSON.parse(localStorage.getItem('sidebar-recent') || '[]'); } catch { return []; }
  });
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const handleViewChange = (view: ToolView) => {
    onChangeView(view);
    setIsMobileMenuOpen(false);
    // Track recent views (last 3, no duplicates, exclude current)
    setRecentViews(prev => {
      const next = [view, ...prev.filter(v => v !== view)].slice(0, 3);
      try { localStorage.setItem('sidebar-recent', JSON.stringify(next)); } catch {}
      return next;
    });
    // Reset unread count when navigating to chat
    if (view === ToolView.TEAM_CHAT) setUnreadChatCount(0);
  };

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  // Listen for unread chat messages broadcast from TeamChat
  useEffect(() => {
    const handler = (e: Event) => {
      const count = (e as CustomEvent).detail?.count ?? 0;
      if (currentView !== ToolView.TEAM_CHAT) setUnreadChatCount(count);
    };
    window.addEventListener('chatUnreadCount', handler);
    return () => window.removeEventListener('chatUnreadCount', handler);
  }, [currentView]);

  // Request notification permission + register web push subscription on mount.
  // enableWebPush handles permission, SW registration, PushManager.subscribe, and persistence.
  useEffect(() => {
    if (!currentUser || currentUser.id === 'guest') return;
    if (!('Notification' in window)) return;

    enableWebPush(currentUser.id).then(result => {
      console.log('[Notifications] Web push enable result:', result);
    }).catch(err => {
      console.error('[Notifications] enableWebPush threw:', err);
    });
  }, [currentUser?.id]);

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
            silent: true
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
    if (!notification.isRead) handleMarkRead(notification.id);
    setIsNotificationsOpen(false);

    if (!notification.linkView) return;
    onChangeView(notification.linkView as ToolView);

    // Normalize linkData (Supabase returns JSONB as object; some old rows are strings).
    let linkData: any = notification.linkData;
    if (typeof linkData === 'string') {
      try { linkData = JSON.parse(linkData); }
      catch (e) { console.error('[Sidebar] Failed to parse linkData:', e); return; }
    }
    if (!linkData) return;

    // Persist + dispatch for each known target. localStorage handles fresh mounts;
    // CustomEvent handles same-view clicks.
    const persistAndDispatch = (key: string, eventName: string) => {
      try {
        localStorage.setItem(key, JSON.stringify(linkData));
        window.dispatchEvent(new CustomEvent(eventName, { detail: linkData }));
      } catch (e) {
        console.error(`[Sidebar] persist/dispatch failed for ${eventName}:`, e);
      }
    };

    if (notification.linkView === 'TASKS' && linkData.taskId) {
      persistAndDispatch('openTaskModal', 'openTaskModal');
    } else if (notification.linkView === 'TEAM_CHAT' && linkData.channelId) {
      persistAndDispatch('openChatNotification', 'openChatNotification');
    } else if (notification.linkView === 'MY_WORK' && linkData.taskId) {
      persistAndDispatch('openMyWorkTask', 'openMyWorkTask');
    }
  };

  const navGroups = [
    {
      label: 'WORK',
      items: [
        { id: ToolView.DASHBOARD,   label: 'Dashboard',     icon: LayoutDashboard, shortcut: 'G D' },
        { id: ToolView.TASKS,       label: 'Project Tasks', icon: TableProperties, shortcut: 'G T' },
        { id: ToolView.MY_WORK,     label: 'My Work',       icon: CheckSquare,     shortcut: 'G M' },
        { id: ToolView.TEAM_CHAT,   label: 'Team Chat',     icon: MessageSquare,   shortcut: 'G C' },
        ...(BEN_USER_IDS.has(currentUser.id) ? [{ id: ToolView.BUSINESS_INBOX, label: 'Business Inbox', icon: Mail, shortcut: 'G I' }] : []),
      ],
    },
    {
      label: 'AI TOOLS',
      items: [
        { id: ToolView.ECHO_WORKSPACES,   label: 'Echo Workspaces',   icon: Zap,        shortcut: 'G E' },
        { id: ToolView.CONTENT_GENERATOR, label: 'Content Generator', icon: PenTool,    shortcut: null },
        { id: ToolView.KEYWORD_RESEARCH,  label: 'Keyword Research',  icon: Search,     shortcut: null },
        { id: ToolView.SITE_AUDIT,        label: 'SEO Audit',         icon: BarChart,   shortcut: null },
        { id: ToolView.QA_CHECKER,        label: 'QA Checker',        icon: FileCheck,  shortcut: null },
      ],
    },
    {
      label: 'ACCOUNT',
      items: [
        { id: ToolView.SETTINGS, label: 'Settings', icon: Settings, shortcut: null },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap(g => g.items);
  const getLabel = (view: ToolView) => allNavItems.find(i => i.id === view)?.label ?? view;
  const getIcon = (view: ToolView) => allNavItems.find(i => i.id === view)?.icon ?? Clock;
  const recentFiltered = recentViews.filter(v => v !== currentView).slice(0, 3);

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
        ${isCollapsed ? 'w-[60px]' : 'w-72 lg:w-64'} bg-portal-surface text-white flex flex-col h-full fixed left-0 top-0 shadow-xl transition-all duration-200 ease-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ zIndex: 100 }}>

      {/* Brand Header */}
      <div className="p-3 pt-8 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
            <img src={logoUrl} alt="BrightForge" className="w-[200px] flex-shrink-0" />
          </div>
        )}
        {isCollapsed && <div className="flex-1" />}

        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          className="lg:hidden p-2 hover:bg-portal-surface2 rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5 text-portal-soft" />
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Notification Bell — hide when collapsed */}
          {!isCollapsed && (
            <div className="relative">
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
          )}

          {/* Collapse toggle — desktop only */}
          <button
            onClick={toggleCollapsed}
            className="hidden lg:flex p-1.5 rounded-lg hover:bg-portal-surface2 transition-colors text-portal-soft hover:text-portal-text"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <nav className={`flex-1 ${isCollapsed ? 'px-1' : 'px-2'} py-3 overflow-y-auto min-h-0 space-y-4`}>

        {/* Command Palette shortcut — hide when collapsed */}
        {onOpenPalette && !isCollapsed && (
          <button
            onClick={onOpenPalette}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] transition-colors text-portal-soft hover:text-portal-text group"
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left text-xs truncate">Search or jump to…</span>
            <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-white/30">⌘K</kbd>
          </button>
        )}
        {onOpenPalette && isCollapsed && (
          <button
            onClick={onOpenPalette}
            className="w-full flex items-center justify-center p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] transition-colors text-portal-soft hover:text-portal-text"
            title="Search (⌘K)"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        {/* Recent views strip — collapsed hides labels */}
        {recentFiltered.length > 0 && !isCollapsed && (
          <div>
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">RECENT</div>
            <div className="space-y-0.5">
              {recentFiltered.map(view => {
                const Icon = getIcon(view);
                return (
                  <button
                    key={view}
                    onClick={() => handleViewChange(view)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-portal-soft/70 hover:bg-portal-surface2 hover:text-portal-text transition-all duration-150 text-xs"
                  >
                    <Clock className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                    <span className="truncate">{getLabel(view)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Grouped nav */}
        {navGroups.map(group => (
          <div key={group.label}>
            {!isCollapsed && (
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                const chatBadge = item.id === ToolView.TEAM_CHAT && unreadChatCount > 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleViewChange(item.id)}
                    title={isCollapsed ? item.label : undefined}
                    className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-${isCollapsed ? '0' : '3'} py-2.5 lg:py-2 rounded-xl lg:rounded-lg transition-all duration-200 group active:scale-[0.98] ${
                      isActive
                        ? 'bg-portal-accent text-white shadow-md shadow-portal-accent/20'
                        : 'text-portal-soft hover:bg-portal-surface2 hover:text-portal-text active:bg-portal-surface2'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-portal-soft group-hover:text-portal-text'}`} />
                      {chatBadge && isCollapsed && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </div>
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 font-medium text-sm truncate text-left">{item.label}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {chatBadge && (
                            <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                              {unreadChatCount > 99 ? '99+' : unreadChatCount}
                            </span>
                          )}
                          {item.shortcut && (
                            <span className="hidden lg:flex gap-0.5">
                              {item.shortcut.split(' ').map((k: string, ki: number) => (
                                <kbd key={ki} className={`px-1 py-0.5 rounded text-[9px] font-mono ${isActive ? 'bg-white/20 text-white/70' : 'bg-white/10 text-white/25'}`}>{k}</kbd>
                              ))}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Invite Button */}
        {currentUser.role === 'Owner' && !isCollapsed && (
          <div>
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">TEAM</div>
            <button
              onClick={onInvite}
              className="w-full flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-xl lg:rounded-lg transition-all duration-200 bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600 hover:text-white active:scale-[0.98] group"
            >
              <UserPlus className="w-4 h-4 flex-shrink-0 text-blue-500 group-hover:text-white" />
              <span className="font-medium text-sm truncate">Invite Member</span>
            </button>
          </div>
        )}
        {currentUser.role === 'Owner' && isCollapsed && (
          <button
            onClick={onInvite}
            title="Invite Member"
            className="w-full flex items-center justify-center py-2.5 lg:py-2 rounded-xl lg:rounded-lg transition-all duration-200 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        )}
      </nav>

      <div className={`${isCollapsed ? 'p-1' : 'p-2'} border-t border-white/[0.07] flex-shrink-0`}>
        {/* User Profile */}
        <div className="relative">
          {isCollapsed ? (
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center justify-center p-2 hover:bg-portal-surface2 rounded-lg transition-colors"
              title={currentUser.name}
            >
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-portal-accent" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-portal-accent flex items-center justify-center text-[10px] font-bold text-white border border-portal-accent shadow-sm">
                  {currentUser.initials}
                </div>
              )}
            </button>
          ) : (
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
          )}

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
        {!isCollapsed && (
          <div className="text-center pt-1">
            <span className="text-[10px] text-portal-soft">v{version}</span>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default Sidebar;