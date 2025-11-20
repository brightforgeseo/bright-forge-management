
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import KeywordTool from './components/KeywordTool';
import ContentTool from './components/ContentTool';
import AuditTool from './components/AuditTool';
import TaskBoard from './components/TaskBoard';
import TeamChat from './components/TeamChat';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';
import ToastContainer from './components/ToastContainer';
import Login from './components/Login';
import { ToolView, BrandingConfig, User, ToastNotification, ToastType } from './types';
import { supabase } from './lib/supabaseClient';
import { addToAllowlist, updateUserProfile } from './services/databaseService';
import { Copy, X, UserPlus, Check, Mail, RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<ToolView>(ToolView.DASHBOARD);
  
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
        // Master override check (Local storage only)
        if (localStorage.getItem('bf_auth_override')) {
          handleUserSession('master-override-id', localStorage.getItem('bf_auth_email') || 'bensocialbeesmedia@gmail.com');
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          handleUserSession(data.session.user.id, data.session.user.email, data.session.user.user_metadata?.full_name);
        }
      } catch (err) { console.warn("Session check failed", err); }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) handleUserSession(session.user.id, session.user.email, session.user.user_metadata?.full_name);
      else if (!localStorage.getItem('bf_auth_override')) setIsAuthenticated(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleUserSession = async (uid: string, email: string | undefined, fullName?: string) => {
    if (!email) return;
    let name = fullName || email.split('@')[0];
    let role = 'Team Member';
    let avatarUrl = undefined;
    const lowerEmail = email.toLowerCase();
    
    if (lowerEmail === 'bensocialbeemedia@gmail.com' || lowerEmail === 'bensocialbeesmedia@gmail.com') {
        name = 'Ben Lowe';
        role = 'Owner';
    }

    try {
        // Fetch latest profile data from DB to ensure sync
        // We use the UID to fetch the profile to ensure we get the right one
        const { data: profile } = await supabase.from('profiles').select('avatar_url, full_name').eq('id', uid).single();
        if (profile) {
            if (profile.avatar_url) avatarUrl = profile.avatar_url;
            if (profile.full_name) name = profile.full_name;
        }
    } catch (e) {}

    // IMPORTANT: Set ID to the real UUID (uid) so DMs work
    setCurrentUser({ id: uid, name, role, initials: name.substring(0, 2).toUpperCase(), email, avatarUrl });
    setIsAuthenticated(true);
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
      case ToolView.TASKS: return <TaskBoard currentUser={currentUser} addToast={addToast} />;
      case ToolView.TEAM_CHAT: return <TeamChat currentUser={currentUser} addToast={addToast} />;
      case ToolView.SETTINGS: return <Settings branding={branding} setBranding={setBranding} addToast={addToast} onProfileUpdate={refreshProfile} />;
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
      />
      <main className={`flex-1 ml-64 h-full overflow-hidden relative ${isFullHeight ? '' : 'bg-slate-50'}`}>
        {isFullHeight ? renderContent() : <ScrollablePageWrapper>{renderContent()}</ScrollablePageWrapper>}
      </main>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 animate-fadeIn backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
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
