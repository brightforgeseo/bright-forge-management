
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import PortalShell from './components/PortalShell';
import {readRoute,saveRoute,viewFromHash}from'./lib/portalRoutes.mjs';
import {hasPendingPush,consumeColdPush}from'./lib/portalPushRoute.mjs';
const ViewActivity=(React as any).Activity;
const HumanMessenger=lazy(()=>import('./components/Messenger'));
const PortalResearch=lazy(()=>import('./components/PortalResearch'));
const ClientPlatform=lazy(()=>import('./components/ClientPlatform'));
const PortalHome=lazy(()=>import('./components/ClientPlatform').then(m=>({default:m.PortalHome})));
const EchoDockConversations=lazy(()=>import('./components/EchoHub').then(m=>({default:m.EchoConversations})));
import Dashboard from './components/Dashboard';
import ToastContainer from './components/ToastContainer';
import Login from './components/Login';
import CommandPalette from './components/CommandPalette';


// Heavy tools are code-split, then preloaded after login so navigation does not
// show a spinner every time Ben moves between features.
const loadKeywordTool = () => import('./components/KeywordTool');
const loadBusinessOS = () => import('./components/BusinessOS');
const loadContentTool = () => import('./components/ContentTool');
const loadAuditTool = () => import('./components/AuditTool');
const loadQAChecker = () => import('./components/QAChecker');
const loadTaskBoard = () => import('./components/TaskBoard');
const loadMyWork = () => import('./components/MyWork');
const loadTeamChat = () => import('./components/TeamChat');
const loadBusinessInbox = () => import('./components/BusinessInbox');
const loadSettings = () => import('./components/Settings');
const loadEchoWorkspaces = () => import('./components/EchoHub');

const preloadViewChunks = () => {
  const priorityLoaders = [
    loadTaskBoard,
    loadTeamChat,
    loadMyWork,
    loadEchoWorkspaces,
    loadBusinessInbox,
    loadContentTool,
  ];

  priorityLoaders.forEach((loader, index) => {
    window.setTimeout(() => { loader().catch(() => {}); }, index * 120);
  });

  // These routes are useful to warm, but they are not worth competing with the
  // first post-login board/profile reads. KeywordTool is the heaviest chunk.
  const deferredLoaders = [loadAuditTool, loadQAChecker, loadSettings, loadKeywordTool];
  window.setTimeout(() => {
    deferredLoaders.forEach((loader, index) => {
      window.setTimeout(() => { loader().catch(() => {}); }, index * 250);
    });
  }, 12_000);
};

const KeywordTool = lazy(loadKeywordTool);
const BusinessOS = lazy(loadBusinessOS);
const ContentTool = lazy(loadContentTool);
const AuditTool = lazy(loadAuditTool);
const QAChecker = lazy(loadQAChecker);
const TaskBoard = lazy(loadTaskBoard);
const MyWork = lazy(loadMyWork);
const TeamChat = lazy(loadTeamChat);
const BusinessInbox = lazy(loadBusinessInbox);
const Settings = lazy(loadSettings);
const EchoWorkspaces = lazy(loadEchoWorkspaces);

const ViewFallback: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);
import { ToolView, BrandingConfig, User, ToastNotification, ToastType, Profile } from './types';
import { supabase, normalizeSupabaseAssetUrl } from './lib/supabaseClient';
import { addToAllowlist, updateUserProfile, checkDueDateNotifications, fetchClientBoardSummaries, fetchProfiles } from './services/databaseService';
import { isBenBusinessOsUser, isBusinessInboxUser } from './services/businessOsModel.mjs';
import { notificationLinkStorage, setNotificationLinkUser, decodeNotificationLinkData } from './lib/notificationLinkStorage.mjs';
import { startNotificationSession } from './lib/notificationSession.mjs';
import { disableWebPush, listenForPushClicks, setPushSession } from './lib/pushNotifications';
import { Copy, X, UserPlus, Check, Mail, RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentView, setCurrentView] = useState<ToolView>(() => ['privateBot','privateGoogleCallback','ordinaryArtifact'].some(key=>new URLSearchParams(window.location.search).has(key)) ? ToolView.ECHO_WORKSPACES : ToolView.DASHBOARD);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });

  // Command Palette
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteClients, setPaletteClients] = useState<{ id: string; name: string; db_id?:string }[]>([]);
  const [paletteProfiles, setPaletteProfiles] = useState<Profile[]>([]);
  const gKeyRef = useRef(false);
  const gKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteStep, setInviteStep] = useState<'form' | 'success'>('form');
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', password: '' });

  const [currentUser, setCurrentUser] = useState<User>({
    id: 'guest', name: 'Guest', role: 'Visitor', initials: 'GU', email: ''
  });

  const [requestedClient,setRequestedClient]=useState<{id:string;token:string}|null>(null);
  const [visited,setVisited]=useState<{owner:string;views:ToolView[]}>({owner:'',views:[]});
  const [dock,setDock]=useState({owner:'',mounted:false,visible:false});
  const humanDraftRef=useRef<any>(null);
  const openEchoDock=useCallback(()=>{window.dispatchEvent(new CustomEvent('portalMessengerMinimise',{detail:{ownerId:currentUser.id}}));setDock({owner:currentUser.id,mounted:true,visible:true});},[currentUser.id]);

  const canNavigateToView = useCallback((view: ToolView) => {
    if (!Object.values(ToolView).includes(view)) return false;
    if (view === ToolView.BUSINESS_OS) return isBenBusinessOsUser(currentUser.id);
    if (view === ToolView.BUSINESS_INBOX) return isBusinessInboxUser(currentUser.id);
    return true;
  }, [currentUser.id]);

  const navigateToView = useCallback((view: ToolView) => {
    const safe=canNavigateToView(view)?view:ToolView.DASHBOARD;
    setCurrentView(safe);saveRoute(currentUser.id,safe);
  }, [canNavigateToView,currentUser.id]);
  const openClient=useCallback((id:string)=>{navigateToView(ToolView.CLIENTS);setRequestedClient({id,token:crypto.randomUUID()});},[navigateToView]);
  useEffect(()=>{if(!isAuthenticated)return;setVisited(old=>old.owner===currentUser.id?{owner:old.owner,views:old.views.includes(currentView)?old.views:[...old.views,currentView]}:{owner:currentUser.id,views:[currentView]});},[currentView,currentUser.id,isAuthenticated]);
  useEffect(()=>{const pop=()=>{const view=viewFromHash(location.hash) as ToolView;setCurrentView(canNavigateToView(view)?view:ToolView.DASHBOARD);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[canNavigateToView]);
  useEffect(()=>{const echo=(event:Event)=>{if((event as CustomEvent).detail?.ownerId===currentUser.id)openEchoDock();};const client=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.ownerId===currentUser.id){const found=paletteClients.find((c:any)=>c.id===detail.clientId||c.db_id===detail.clientId);if(found)openClient((found as any).db_id||found.id);}};const human=(event:Event)=>{if((event as CustomEvent).detail?.ownerId===currentUser.id)setDock(old=>({...old,visible:false}));};window.addEventListener('portalHumanChatOpened',human);window.addEventListener('portalOpenEcho',echo);window.addEventListener('echoResearchDraft',echo);window.addEventListener('portalOpenClient',client);return()=>{window.removeEventListener('portalHumanChatOpened',human);window.removeEventListener('portalOpenEcho',echo);window.removeEventListener('echoResearchDraft',echo);window.removeEventListener('portalOpenClient',client);};},[currentUser.id,openEchoDock,openClient,paletteClients]);

  const studioLandingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated) { studioLandingRef.current = null; return; }
    if(hasPendingPush(location.hash))return;
    if(studioLandingRef.current!==currentUser.id){studioLandingRef.current=currentUser.id;const deep=['privateBot','ordinaryArtifact','privateGoogleCallback'].some(k=>new URLSearchParams(location.search).has(k));const restored=(deep?ToolView.ECHO_WORKSPACES:location.hash?viewFromHash(location.hash):readRoute(currentUser.id)) as ToolView;const safe=canNavigateToView(restored)?restored:ToolView.DASHBOARD;setCurrentView(safe);saveRoute(currentUser.id,safe,{replace:true,preserveNested:true});if(deep)openEchoDock();}
  }, [isAuthenticated,currentUser.id,canNavigateToView,openEchoDock]);

  useEffect(() => {
    if (!Object.values(ToolView).includes(currentView) || !canNavigateToView(currentView)) {
      setCurrentView(ToolView.DASHBOARD);
    }
  }, [canNavigateToView, currentView]);

  const refreshProfile = async () => {
     const { data: { user } } = await supabase.auth.getUser();
     if (user && user.email) {
        handleUserSession(user.id, user.email, user.user_metadata?.full_name);
     }
  };

  const sessionIdentityRef = React.useRef<string | null>(null);
  const sessionRevisionRef = React.useRef(0);
  const [notificationWarning, setNotificationWarning] = useState(false);
  const notificationSessionRef = React.useRef<ReturnType<typeof startNotificationSession> | null>(null);
  useEffect(() => {
    localStorage.removeItem('bf_auth_override');
    localStorage.removeItem('bf_auth_email');
    const lifecycle = startNotificationSession({
      auth:supabase.auth, bind:setPushSession, cleanup:disableWebPush,
      onNotificationError:() => setNotificationWarning(true),
      onInvalidate:() => {
        sessionRevisionRef.current++;
        sessionIdentityRef.current = null;
        setNotificationLinkUser(null);
        if (userSessionDebounceRef.current) clearTimeout(userSessionDebounceRef.current);
        try { if (typeof window.electronAPI?.clearNotifications === 'function') window.electronAPI.clearNotifications(); } catch { setNotificationWarning(true); }
        setIsAuthenticated(false);
        setCurrentView(ToolView.DASHBOARD);
        setPaletteClients([]); setPaletteProfiles([]); setToasts([]);
        for (const key of ['openTaskModal','openChatNotification','openMyWorkTask']) localStorage.removeItem(key);
      },
      onSession:(session:any) => {
        sessionIdentityRef.current = session.user.id;
        setNotificationLinkUser(session.user.id);
        handleUserSession(session.user.id,session.user.email,session.user.user_metadata?.full_name);
      }
    });
    notificationSessionRef.current = lifecycle;
    void lifecycle.check();
    const check = () => { void lifecycle.check(); };
    window.addEventListener('focus',check);
    navigator.serviceWorker?.addEventListener('controllerchange',check);
    return () => { lifecycle.stop();window.removeEventListener('focus',check);navigator.serviceWorker?.removeEventListener('controllerchange',check); };
  }, []);

  const handleUserSession = async (uid: string, email: string | undefined, fullName?: string) => {
    if (!email || sessionIdentityRef.current !== uid) return;
    const revision = sessionRevisionRef.current;
    // Authentication is already verified by GoTrue. Profile display enrichment
    // is optional and must not strand a valid login behind a slow REST request.
    const initialName = fullName || email.split('@')[0];
    setCurrentUser(previous => previous.id === uid ? previous : {
      id:uid, name:initialName, role:'Team Member', initials:initialName.substring(0,2).toUpperCase(), email
    });
    setIsAuthenticated(true);

    // Debounce to prevent multiple rapid calls
    if (userSessionDebounceRef.current) {
      clearTimeout(userSessionDebounceRef.current);
    }

    userSessionDebounceRef.current = setTimeout(async () => {
    let name = fullName || email.split('@')[0];
    let role = 'Team Member';
    let avatarUrl = undefined;
    const lowerEmail = email.toLowerCase();

    try {
        // Fetch role from allowed_users table
        console.log('[App] Checking role for email:', lowerEmail);
        const { data: allowedUser, error: roleError } = await supabase
            .from('allowed_users')
            .select('role, full_name')
            .eq('email', lowerEmail)
            .single();

        console.log('[App] allowed_users query result:', allowedUser);
        console.log('[App] allowed_users query error:', roleError);

        if (allowedUser) {
            role = allowedUser.role || 'Team Member';
            if (allowedUser.full_name) name = allowedUser.full_name;
            console.log('[App] Role set to:', role);
        } else {
            console.warn('[App] No allowed_user found for:', lowerEmail);
        }

        // Fetch avatar and profile data from profiles table
        const { data: profile } = await supabase
            .from('profiles')
            .select('avatar_url, full_name')
            .eq('id', uid)
            .single();

        if (profile) {
            if (profile.avatar_url) avatarUrl = normalizeSupabaseAssetUrl(profile.avatar_url) || profile.avatar_url;
            if (profile.full_name) name = profile.full_name;
        }
    } catch (e) {
        console.error('[App] Error fetching user data:', e);
    }

    if (sessionIdentityRef.current !== uid || sessionRevisionRef.current !== revision) return;
    setCurrentUser({ id: uid, name, role, initials: name.substring(0, 2).toUpperCase(), email, avatarUrl });
    setIsAuthenticated(true);

    // Check for due date notifications once per day
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const lastCheck = localStorage.getItem('lastDueDateCheck');

    if (lastCheck !== today) {
      window.setTimeout(() => {
        checkDueDateNotifications(uid)
        .then(() => localStorage.setItem('lastDueDateCheck', today))
        .catch(err => console.error('Error checking due dates:', err));
      }, 6_000);
    }
    }, 100); // 100ms debounce
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
    notificationSessionRef.current?.pause();
    setIsAuthenticated(false);
    try { if (typeof window.electronAPI?.clearNotifications === 'function') window.electronAPI.clearNotifications(); } catch { setNotificationWarning(true); }
    sessionIdentityRef.current = null;
    if (userSessionDebounceRef.current) clearTimeout(userSessionDebounceRef.current);
    const [cleanup, {error}] = await Promise.all([disableWebPush(), supabase.auth.signOut()]);

    if (error) { addToast('error','Sign out could not be confirmed. Please retry.'); return; }
    if (!cleanup.ok) {
      setNotificationWarning(true);
      addToast('error','Signed out, but device cleanup was incomplete. Check notification settings before sharing this device.');
    }
    setIsAuthenticated(false);
    localStorage.removeItem('bf_auth_override');
    localStorage.removeItem('bf_auth_email');
    } catch {
      addToast('error','Sign out could not be confirmed. Please retry.');
    } finally {
      notificationSessionRef.current?.resume();
      setIsLoggingOut(false);
    }
  };

  const [branding, setBranding] = useState<BrandingConfig>(() => {
    try { return JSON.parse(localStorage.getItem('bf_branding') || '{}'); } catch { return { companyName: 'BrightForge', primaryColor: 'orange' }; }
  });
  if (!branding.companyName) branding.companyName = 'BrightForge';

  useEffect(() => { localStorage.setItem('bf_branding', JSON.stringify(branding)); document.title = branding.companyName; }, [branding]);

  // Handle web-push notification clicks: route to the right view + replay the deep-link
  // events that the Sidebar click flow already wires up.
  const applyPushDeepLink = React.useCallback((linkView: string, linkData: any) => {
    linkData = decodeNotificationLinkData(linkData);
    if (!linkView) return;
    const view = linkView as ToolView;
    if (!canNavigateToView(view)) return;
    navigateToView(view);
    if (linkView === 'TASKS' && linkData?.taskId) {
      try { notificationLinkStorage.setItem('openTaskModal', JSON.stringify(linkData)); } catch {}
      window.dispatchEvent(new CustomEvent('openTaskModal', { detail: linkData }));
    } else if (linkView === 'TEAM_CHAT' && linkData?.channelId) {
      try { notificationLinkStorage.setItem('openChatNotification', JSON.stringify(linkData)); } catch {}
      window.dispatchEvent(new CustomEvent('openChatNotification', { detail: linkData }));
    } else if (linkView === 'MY_WORK' && linkData?.taskId) {
      try { notificationLinkStorage.setItem('openMyWorkTask', JSON.stringify(linkData)); } catch {}
      window.dispatchEvent(new CustomEvent('openMyWorkTask', { detail: linkData }));
    }
  }, [canNavigateToView, navigateToView]);

  // Native clicks share the in-app destination, but never cross account boundaries.
  useEffect(() => {
    const bridge = window.electronAPI;
    if (typeof bridge?.onNotificationClick !== 'function') return;
    const unsubscribe = bridge.onNotificationClick((destination) => {
      if (!isAuthenticated || sessionIdentityRef.current !== currentUser.id || destination?.userId !== currentUser.id || !destination.linkView) return;
      applyPushDeepLink(destination.linkView, destination.linkData);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [isAuthenticated, currentUser.id, applyPushDeepLink]);

  // Cold-start URLs must survive the initial unauthenticated render.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated) return;
    const hash=window.location.hash;
    if(!hasPendingPush(hash))return;
    studioLandingRef.current=currentUser.id;
    consumeColdPush({hash,owner:currentUser.id,canAccess:canNavigateToView,
      clear:()=>history.replaceState(null,'',window.location.pathname+window.location.search),
      apply:applyPushDeepLink,fallback:()=>navigateToView(ToolView.DASHBOARD)});
  }, [isAuthenticated,currentUser.id,applyPushDeepLink,canNavigateToView,navigateToView]);

  // 2) Warm-tab: SW posts a message when the user clicks a push and we already had a tab open.
  useEffect(() => {
    return listenForPushClicks((url) => {
      const idx = url.indexOf('push=');
      if (idx === -1) return;
      try {
        const raw = decodeURIComponent(url.slice(idx + 5));
        const { recipientId, linkView, linkData } = JSON.parse(raw);
        if (!isAuthenticated) {
          history.replaceState(null,'',window.location.pathname+window.location.search+'#push='+encodeURIComponent(JSON.stringify({recipientId,linkView,linkData})));
          return;
        }
        if (recipientId === currentUser.id) applyPushDeepLink(linkView, linkData);
      } catch (e) {
        console.error('[App] Failed to parse push-click message:', e);
      }
    });
  }, [isAuthenticated, currentUser.id, applyPushDeepLink]);

  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const userSessionDebounceRef = React.useRef<NodeJS.Timeout | null>(null);
  const addToast = (type: ToastType, message: string) => setToasts(prev => [...prev, { id: Date.now().toString(), type, message }]);
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Load palette data once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchClientBoardSummaries().then(boards => {
      setPaletteClients(boards.map(b => ({ id: b.id, name: b.name, db_id:b.db_id })));
    }).catch(() => {});
    fetchProfiles().then(setPaletteProfiles).catch(() => {});
  }, [isAuthenticated]);

  // Warm the lazy-loaded feature chunks after the dashboard is usable. This keeps
  // code-splitting benefits on login but removes the route-change buffering.
  useEffect(() => {
    if (!isAuthenticated) return;

    if (isBenBusinessOsUser(currentUser.id)) loadBusinessOS().catch(() => {});

    let idleHandle: number | undefined;
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleHandle = (window as any).requestIdleCallback(preloadViewChunks, { timeout: 2500 });
      } else {
        preloadViewChunks();
      }
    }, 900);

    return () => {
      window.clearTimeout(timer);
      if (idleHandle !== undefined && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [isAuthenticated, currentUser.id]);

  // Sync sidebar collapsed state from localStorage (Sidebar writes it directly)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sidebar-collapsed') {
        setIsSidebarCollapsed(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Global keyboard shortcuts
  // Cmd/Ctrl+K → Command Palette
  // G then D/T/M/C/E → jump to view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

      // Cmd/Ctrl+K — always open palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(p => !p);
        return;
      }

      // Escape closes palette
      if (e.key === 'Escape') {
        setIsPaletteOpen(false);
        return;
      }

      // G+key shortcuts — only when not in an input
      if (inInput) return;

      if (e.key === 'g' || e.key === 'G') {
        gKeyRef.current = true;
        if (gKeyTimerRef.current) clearTimeout(gKeyTimerRef.current);
        gKeyTimerRef.current = setTimeout(() => { gKeyRef.current = false; }, 1500);
        return;
      }

      if (gKeyRef.current) {
        const map: Record<string, ToolView> = {
          'o': ToolView.BUSINESS_OS,
          'd': ToolView.DASHBOARD,
          't': ToolView.TASKS,
          'm': ToolView.MY_WORK,
          'c': ToolView.TEAM_CHAT,
          'e': ToolView.ECHO_WORKSPACES,
          'i': ToolView.BUSINESS_INBOX,
        };
        const target = map[e.key.toLowerCase()];
        if (target && canNavigateToView(target)) {
          e.preventDefault();
          gKeyRef.current = false;
          navigateToView(target);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNavigateToView, navigateToView]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const requested = detail.view as ToolView | undefined;
      if (requested) navigateToView(requested);
    };
    window.addEventListener('navigateToView', handler);
    return () => window.removeEventListener('navigateToView', handler);
  }, [navigateToView]);

  // Generate random password for invites
  const generatePassword = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
      let pass = '';
      for(let i=0; i<12; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
      setInviteForm(prev => ({ ...prev, password: pass }));
  };

  const handleCreateInvite = async () => {
      if (!inviteForm.email.trim() || !inviteForm.name.trim()) {
          addToast('error', 'Please fill in Name and Email');
          return;
      }
      try {
          await addToAllowlist(inviteForm.email, inviteForm.name, inviteForm.password);
          addToast('success', 'User authorized!');
          setInviteStep('success');
      } catch (e) {
          console.error(e);
          addToast('error', 'Failed to invite. Email might already be in use.');
      }
  };

  const resetInviteModal = () => {
      setShowInviteModal(false);
      setInviteStep('form');
      setInviteForm({ email: '', name: '', password: '' });
  };

  // Construct Mailto Link safely
  const getMailtoLink = () => {
    const subject = `Invite to ${branding.companyName}`;
    const body = `Hi ${inviteForm.name},

You've been invited to the ${branding.companyName} portal.

Here are your login details:
URL: ${window.location.origin}
Email: ${inviteForm.email}
Password: ${inviteForm.password}

Please log in and change your password.

Best,
${currentUser.name}`;
    
    return `mailto:${inviteForm.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const renderContent = (targetView:ToolView=currentView) => {
    const view = (() => {
      switch (targetView) {
        case ToolView.CLIENTS:return <ClientPlatform currentUser={currentUser} addToast={addToast} onNavigate={navigateToView} initialClientId={requestedClient?.id} initialRequestToken={requestedClient?.token}/>;
        case ToolView.OPERATIONS:return <Dashboard currentUser={currentUser} setCurrentView={navigateToView}/>;
        case ToolView.BUSINESS_OS: return isBenBusinessOsUser(currentUser.id)
          ? <BusinessOS currentUser={currentUser} setCurrentView={navigateToView} />
          : <Dashboard currentUser={currentUser} setCurrentView={navigateToView} />;
        case ToolView.KEYWORD_RESEARCH: return <KeywordTool onNavigateToContent={() => navigateToView(ToolView.CONTENT_GENERATOR)} />;
        case ToolView.CONTENT_GENERATOR: return <ContentTool />;
        case ToolView.SITE_AUDIT: return <AuditTool />;
        case ToolView.QA_CHECKER: return <QAChecker />;
        case ToolView.TASKS: return <TaskBoard currentUser={currentUser} addToast={addToast} />;
        case ToolView.MY_WORK: return <MyWork currentUser={currentUser} addToast={addToast} onNavigateToTasks={() => navigateToView(ToolView.TASKS)} />;
        case ToolView.TEAM_CHAT: return null;
        case ToolView.BUSINESS_INBOX: return <BusinessInbox currentUser={currentUser} addToast={addToast} />;
        case ToolView.ECHO_WORKSPACES: return <PortalResearch key={currentUser.id} currentUser={currentUser} addToast={addToast}/>;
        case ToolView.SETTINGS: return <Settings branding={branding} setBranding={setBranding} addToast={addToast} currentUser={currentUser} />;
        default: return <PortalHome currentUser={currentUser} onNavigate={navigateToView} onOpenClient={openClient}/>;
      }
    })();
    return <Suspense fallback={<ViewFallback />}>{view}</Suspense>;
  };

  if (isLoggingOut) return <div role="status" className="min-h-screen flex items-center justify-center">Signing out and clearing this device…</div>;
  if (!isAuthenticated) return <><Login onLogin={() => { void notificationSessionRef.current?.check(); }} branding={branding} />{notificationWarning && <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-xl bg-amber-950 p-4 text-sm text-amber-100">A device notification check failed. Do not share this device until notification cleanup is confirmed. This is separate from checking your password.</div>}</>;

  const visibleViews=Array.from(new Set<ToolView>([...(visited.owner===currentUser.id?visited.views:[]),currentView])).filter(canNavigateToView);
  const isFullHeight = currentView === ToolView.TASKS || currentView === ToolView.TEAM_CHAT || currentView === ToolView.BUSINESS_INBOX || currentView === ToolView.ECHO_WORKSPACES;

  return (
    <div className="portal-calm h-screen overflow-hidden font-sans">
      {notificationWarning && <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-xl bg-amber-950 p-4 text-sm text-amber-100 shadow-lg">Signed in. A background notification check failed. Background alerts must not be relied on. Do not share this device until notification cleanup is confirmed.</div>}
      <PortalShell key={currentUser.id} currentUser={currentUser} branding={branding} view={currentView} onNavigate={navigateToView} canAccess={canNavigateToView} onSearch={()=>setIsPaletteOpen(true)} onEcho={openEchoDock} onLogout={handleLogout} onInvite={()=>{generatePassword();setShowInviteModal(true);}}>
        <main className="pp-content" key={currentUser.id+':'+sessionRevisionRef.current}>
          {visibleViews.map(view=><ViewActivity key={currentUser.id+':'+view} mode={view===currentView?'visible':'hidden'}><section className="pp-visited-page" data-view={view} hidden={view!==currentView}>
            {[ToolView.OPERATIONS,ToolView.TASKS,ToolView.MY_WORK,ToolView.BUSINESS_INBOX].includes(view)?<><nav className="pp-work-tabs" aria-label="Work pages">{[{id:ToolView.OPERATIONS,label:'Overview'},{id:ToolView.TASKS,label:'Client tasks'},{id:ToolView.MY_WORK,label:'My tasks'},{id:ToolView.BUSINESS_INBOX,label:'Inbox'}].filter(item=>canNavigateToView(item.id)).map(item=><button key={item.id} className={item.id===view?'is-active':''} onClick={()=>navigateToView(item.id)}>{item.label}</button>)}</nav><div className="pp-work-frame">{renderContent(view)}</div></>:renderContent(view)}
          </section></ViewActivity>)}
        </main>
        <Suspense fallback={null}><HumanMessenger key={currentUser.id} currentUser={currentUser} view={currentView} addToast={addToast} onNavigate={navigateToView} draftRef={humanDraftRef}/></Suspense>
        {dock.owner===currentUser.id&&dock.mounted&&<section className="pp-echo-dock" hidden={!dock.visible} aria-label="Echo conversation"><header><strong>Echo</strong><button aria-label="Close Echo" onClick={()=>setDock(old=>({...old,visible:false}))}><X size={18}/></button></header><div><Suspense fallback={<ViewFallback/>}><EchoDockConversations key={currentUser.id} currentUser={currentUser} addToast={addToast}/></Suspense></div></section>}
        {!(dock.owner===currentUser.id&&dock.visible)&&<button className="pp-echo-toggle" onClick={openEchoDock}><MessageSquare size={19}/>Ask Echo</button>}
      </PortalShell>
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onNavigate={(view) => { navigateToView(view); setIsPaletteOpen(false); }}
        currentUser={currentUser}
        clients={paletteClients}
        profiles={paletteProfiles}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 lg:p-8 animate-fadeIn backdrop-blur-sm">
           <div className="bg-portal-surface rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-white/[0.07] max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-white/[0.07] flex justify-between items-center bg-portal-dark">
                 <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-brand-600" /> 
                    {inviteStep === 'form' ? 'Create Invite Credentials' : 'Invite Generated'}
                 </h3>
                 <button onClick={resetInviteModal} className="text-slate-400 hover:text-portal-soft"><X className="w-5 h-5" /></button>
              </div>
              
              {inviteStep === 'form' ? (
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                        <input 
                            value={inviteForm.name}
                            onChange={e => setInviteForm({...inviteForm, name: e.target.value})}
                            className="w-full p-2.5 border border-white/[0.07] rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                            placeholder="e.g. Sarah Jones"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                        <input 
                            value={inviteForm.email}
                            onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                            className="w-full p-2.5 border border-white/[0.07] rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                            placeholder="colleague@company.com"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                            Temporary Password
                            <button onClick={generatePassword} className="text-brand-600 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Generate</button>
                        </label>
                        <input 
                            value={inviteForm.password}
                            onChange={e => setInviteForm({...inviteForm, password: e.target.value})}
                            className="w-full p-2.5 border border-white/[0.07] rounded-lg outline-none focus:border-brand-500 font-mono text-sm bg-portal-dark"
                        />
                    </div>
                    <div className="pt-2">
                        <button 
                            onClick={handleCreateInvite}
                            className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-600/20 transition-all"
                        >
                            Generate Invite
                        </button>
                    </div>
                </div>
              ) : (
                <div className="p-6 space-y-6 text-center">
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-left flex gap-3">
                         <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                         <div className="text-sm text-amber-900">
                             <p className="font-bold">Manual Delivery Required</p>
                             <p className="mt-1">Browsers cannot send emails automatically. Click below to open your mail app with the invite pre-filled.</p>
                         </div>
                    </div>

                    <div className="bg-slate-900 text-slate-200 p-5 rounded-xl text-left font-mono text-sm space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 bg-slate-800/50 rounded-bl-xl text-xs text-slate-400 uppercase font-bold">
                            Credentials
                        </div>
                        <div>
                            <span className="text-slate-500 block text-xs uppercase tracking-wider">Email</span>
                            <span className="text-white select-all">{inviteForm.email}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block text-xs uppercase tracking-wider">Password</span>
                            <span className="text-white bg-slate-800 px-2 py-0.5 rounded select-all">{inviteForm.password}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <a 
                            href={getMailtoLink()}
                            className="flex items-center justify-center gap-2 py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-lg shadow-brand-600/20 transition-all"
                        >
                            <Mail className="w-5 h-5" /> Open Email App
                        </a>
                        
                        <button 
                            onClick={() => {
                                const text = `Hi ${inviteForm.name},\n\nYou've been invited to the ${branding.companyName} portal.\n\nLogin here: ${window.location.origin}\nEmail: ${inviteForm.email}\nPassword: ${inviteForm.password}\n\nPlease change your password after logging in.`;
                                navigator.clipboard.writeText(text);
                                addToast('success', 'Invite message copied to clipboard!');
                            }}
                            className="flex items-center justify-center gap-2 py-2 border border-white/[0.07] rounded-lg font-semibold hover:bg-portal-dark text-sm text-portal-soft"
                        >
                            <MessageSquare className="w-4 h-4" /> Copy Message for Slack
                        </button>
                    </div>
                    <button onClick={resetInviteModal} className="text-slate-400 hover:text-portal-soft text-sm mt-2">Close</button>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

const ScrollablePageWrapper: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <div className="h-full overflow-y-auto custom-scrollbar">
     <div className="min-h-full pb-20">
        {children}
     </div>
  </div>
);

export default App;
