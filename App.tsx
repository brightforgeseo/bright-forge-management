
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import KeywordTool from './components/KeywordTool';
import ContentTool from './components/ContentTool';
import AuditTool from './components/AuditTool';
import QAChecker from './components/QAChecker';
import TaskBoard from './components/TaskBoard';
import MyWork from './components/MyWork';
import TeamChat from './components/TeamChat';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';
import ToastContainer from './components/ToastContainer';
import Login from './components/Login';
import { ToolView, BrandingConfig, User, ToastNotification, ToastType } from './types';
import { supabase } from './lib/supabaseClient';
import { addToAllowlist, updateUserProfile, checkDueDateNotifications } from './services/databaseService';
import { Copy, X, UserPlus, Check, Mail, RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<ToolView>(ToolView.DASHBOARD);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteStep, setInviteStep] = useState<'form' | 'success'>('form');
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', password: '' });

  const [currentUser, setCurrentUser] = useState<User>({
    id: 'guest', name: 'Guest', role: 'Visitor', initials: 'GU', email: ''
  });

  const refreshProfile = async () => {
     const { data: { user } } = await supabase.auth.getUser();
     if (user && user.email) {
        handleUserSession(user.id, user.email, user.user_metadata?.full_name);
     }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Clear any old master password sessions
        localStorage.removeItem('bf_auth_override');
        localStorage.removeItem('bf_auth_email');

        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          handleUserSession(data.session.user.id, data.session.user.email, data.session.user.user_metadata?.full_name);
        }
      } catch (err) { console.warn("Session check failed", err); }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) handleUserSession(session.user.id, session.user.email, session.user.user_metadata?.full_name);
      else setIsAuthenticated(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // Empty dependency - subscription should only be set up once on mount

  const handleUserSession = async (uid: string, email: string | undefined, fullName?: string) => {
    if (!email) return;

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
            if (profile.avatar_url) avatarUrl = profile.avatar_url;
            if (profile.full_name) name = profile.full_name;
        }
    } catch (e) {
        console.error('[App] Error fetching user data:', e);
    }

    setCurrentUser({ id: uid, name, role, initials: name.substring(0, 2).toUpperCase(), email, avatarUrl });
    setIsAuthenticated(true);

    // Check for due date notifications once per day
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const lastCheck = localStorage.getItem('lastDueDateCheck');

    if (lastCheck !== today) {
      checkDueDateNotifications(uid)
        .then(() => localStorage.setItem('lastDueDateCheck', today))
        .catch(err => console.error('Error checking due dates:', err));
    }
    }, 100); // 100ms debounce
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    localStorage.removeItem('bf_auth_override');
    localStorage.removeItem('bf_auth_email');
  };

  const [branding, setBranding] = useState<BrandingConfig>(() => {
    try { return JSON.parse(localStorage.getItem('bf_branding') || '{}'); } catch { return { companyName: 'Bright Forge Portal', primaryColor: 'orange' }; }
  });
  if (!branding.companyName) branding.companyName = 'Bright Forge Portal';

  useEffect(() => { localStorage.setItem('bf_branding', JSON.stringify(branding)); document.title = branding.companyName; }, [branding]);

  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const userSessionDebounceRef = React.useRef<NodeJS.Timeout | null>(null);
  const addToast = (type: ToastType, message: string) => setToasts(prev => [...prev, { id: Date.now().toString(), type, message }]);
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

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

  const renderContent = () => {
    switch (currentView) {
      case ToolView.KEYWORD_RESEARCH: return <KeywordTool />;
      case ToolView.CONTENT_GENERATOR: return <ContentTool />;
      case ToolView.SITE_AUDIT: return <AuditTool />;
      case ToolView.QA_CHECKER: return <QAChecker />;
      case ToolView.TASKS: return <TaskBoard currentUser={currentUser} addToast={addToast} />;
      case ToolView.MY_WORK: return <MyWork currentUser={currentUser} addToast={addToast} onNavigateToTasks={() => setCurrentView(ToolView.TASKS)} />;
      case ToolView.TEAM_CHAT: return <TeamChat currentUser={currentUser} addToast={addToast} onNavigateToTask={() => setCurrentView(ToolView.TASKS)} />;
      case ToolView.SETTINGS: return <Settings branding={branding} setBranding={setBranding} addToast={addToast} currentUser={currentUser} />;
      default: return <Dashboard currentUser={currentUser} setCurrentView={setCurrentView} />;
    }
  };

  if (!isAuthenticated) return <Login onLogin={(email) => {
      // For legacy/fallback login, we might not have the UUID immediately available here
      // The useEffect will catch the session change and update the ID correctly
      // We just trigger a temporary state update here
      if(localStorage.getItem('bf_auth_override')) {
         handleUserSession('master-override-id', email);
      }
  }} branding={branding} />;

  const isFullHeight = currentView === ToolView.TASKS || currentView === ToolView.TEAM_CHAT;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        branding={branding}
        currentUser={currentUser}
        onLogout={handleLogout}
        onInvite={() => { generatePassword(); setShowInviteModal(true); }}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Mobile Header - Hidden on TeamChat which has its own header */}
      {currentView !== ToolView.TEAM_CHAT && (
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-3 safe-area-inset-top">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors active:bg-slate-200 flex-shrink-0"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              </svg>
            </div>
            <span className="font-bold text-slate-900 truncate text-sm">{branding.companyName}</span>
          </div>
        </div>
      </div>
      )}

      <main className={`flex-1 lg:ml-64 h-full overflow-hidden relative ${isFullHeight ? '' : 'bg-slate-50'} ${currentView === ToolView.TEAM_CHAT ? '' : 'pt-14'} lg:pt-0`}>
        {isFullHeight ? renderContent() : <ScrollablePageWrapper>{renderContent()}</ScrollablePageWrapper>}
      </main>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 lg:p-8 animate-fadeIn backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-brand-600" /> 
                    {inviteStep === 'form' ? 'Create Invite Credentials' : 'Invite Generated'}
                 </h3>
                 <button onClick={resetInviteModal} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              
              {inviteStep === 'form' ? (
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                        <input 
                            value={inviteForm.name}
                            onChange={e => setInviteForm({...inviteForm, name: e.target.value})}
                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                            placeholder="e.g. Sarah Jones"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                        <input 
                            value={inviteForm.email}
                            onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
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
                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-brand-500 font-mono text-sm bg-slate-50"
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
                            className="flex items-center justify-center gap-2 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-sm text-slate-600"
                        >
                            <MessageSquare className="w-4 h-4" /> Copy Message for Slack
                        </button>
                    </div>
                    <button onClick={resetInviteModal} className="text-slate-400 hover:text-slate-600 text-sm mt-2">Close</button>
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
