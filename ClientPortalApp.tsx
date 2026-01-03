import React, { useState, useEffect, useRef } from 'react';
import ToastContainer from './components/ToastContainer';
import ClientPortalLogin from './components/client-portal/ClientPortalLogin';
import ClientPortalLayout from './components/client-portal/ClientPortalLayout';
import ClientPortalDashboard from './components/client-portal/ClientPortalDashboard';
import ClientPortalTaskBoard from './components/client-portal/ClientPortalTaskBoard';
import ClientPortalChat from './components/client-portal/ClientPortalChat';
import ClientPortalSettings from './components/client-portal/ClientPortalSettings';
import { PortalView, PartnerAccount } from './types-portal';
import { ToastNotification, ToastType } from './types';
import { supabase } from './lib/supabaseClient';
import {
  fetchPartnerAccount,
  updatePartnerLastLogin,
  getUnreadMessageCount,
  subscribeToPartnerMessages,
} from './services/clientPortalService';

const ClientPortalApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<PortalView>(PortalView.DASHBOARD);
  const [partnerAccount, setPartnerAccount] = useState<PartnerAccount | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>();

  // Toast notifications
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const addToast = (type: ToastType, message: string) => {
    setToasts(prev => [...prev, { id: Date.now().toString(), type, message }]);
  };
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Session debounce ref
  const sessionDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          await handlePartnerSession(data.session.user.id, data.session.user.user_metadata);
        }
      } catch (err) {
        console.warn('[ClientPortal] Session check failed', err);
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await handlePartnerSession(session.user.id, session.user.user_metadata);
      } else {
        setIsAuthenticated(false);
        setPartnerAccount(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Handle partner session
  const handlePartnerSession = async (userId: string, metadata?: any) => {
    // Debounce to prevent multiple rapid calls
    if (sessionDebounceRef.current) {
      clearTimeout(sessionDebounceRef.current);
    }

    sessionDebounceRef.current = setTimeout(async () => {
      // Check if user is a partner
      if (metadata?.user_type !== 'partner') {
        console.warn('[ClientPortal] User is not a partner, redirecting...');
        addToast('error', 'This portal is for partner accounts only');
        await supabase.auth.signOut();
        // Redirect to main app
        window.location.href = '/';
        return;
      }

      // Fetch partner account
      const account = await fetchPartnerAccount(userId);
      if (!account) {
        console.error('[ClientPortal] Partner account not found');
        addToast('error', 'Partner account not found');
        await supabase.auth.signOut();
        return;
      }

      if (!account.is_active) {
        addToast('error', 'Your account has been deactivated. Please contact support.');
        await supabase.auth.signOut();
        return;
      }

      setPartnerAccount(account);
      setIsAuthenticated(true);

      // Update last login
      await updatePartnerLastLogin(userId);

      // Get unread message count
      const unread = await getUnreadMessageCount(userId, true);
      setUnreadMessages(unread);
    }, 100);
  };

  // Subscribe to new messages for unread count
  useEffect(() => {
    if (!partnerAccount) return;

    const channel = subscribeToPartnerMessages(partnerAccount.id, (message) => {
      // Only count if message is from team and we're not on chat view
      if (message.sender_type === 'team' && currentView !== PortalView.CHAT) {
        setUnreadMessages(prev => prev + 1);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partnerAccount, currentView]);

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setPartnerAccount(null);
    setCurrentView(PortalView.DASHBOARD);
  };

  // Handle login success
  const handleLoginSuccess = async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      await handlePartnerSession(data.session.user.id, data.session.user.user_metadata);
    }
  };

  // Navigate to tasks with optional client filter
  const handleNavigateToTasks = (clientId?: string) => {
    setSelectedClientId(clientId);
    setCurrentView(PortalView.TASKS);
  };

  // Handle messages read
  const handleMessagesRead = () => {
    setUnreadMessages(0);
  };

  // Handle account updated
  const handleAccountUpdated = (account: PartnerAccount) => {
    setPartnerAccount(account);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Login page
  if (!isAuthenticated || !partnerAccount) {
    return (
      <>
        <ClientPortalLogin onLoginSuccess={handleLoginSuccess} addToast={addToast} />
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </>
    );
  }

  // Render current view
  const renderContent = () => {
    switch (currentView) {
      case PortalView.DASHBOARD:
        return (
          <ClientPortalDashboard
            partnerAccount={partnerAccount}
            addToast={addToast}
            onNavigateToTasks={handleNavigateToTasks}
          />
        );
      case PortalView.TASKS:
        return (
          <ClientPortalTaskBoard
            partnerAccount={partnerAccount}
            addToast={addToast}
            selectedClientId={selectedClientId}
          />
        );
      case PortalView.CHAT:
        return (
          <ClientPortalChat
            partnerAccount={partnerAccount}
            addToast={addToast}
            onMessagesRead={handleMessagesRead}
          />
        );
      case PortalView.SETTINGS:
        return (
          <ClientPortalSettings
            partnerAccount={partnerAccount}
            addToast={addToast}
            onAccountUpdated={handleAccountUpdated}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <ClientPortalLayout
        partnerAccount={partnerAccount}
        addToast={addToast}
        currentView={currentView}
        onChangeView={setCurrentView}
        unreadMessages={unreadMessages}
        onLogout={handleLogout}
      >
        {renderContent()}
      </ClientPortalLayout>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
};

export default ClientPortalApp;
