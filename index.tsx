import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ClientPortalApp from './ClientPortalApp';
import { supabase } from './lib/supabaseClient';
import { installErrorReporter, reportError } from './lib/errorReporter';
import './styles.css';

console.log("Starting Application Mount...");
installErrorReporter();

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Error Boundary Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Application Crash:", error, errorInfo);
    reportError(error.message, `${error.stack || ''}\n${errorInfo.componentStack || ''}`, 'error-boundary');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#333', maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ color: '#ef4444' }}>Something went wrong</h1>
          <p>The application encountered a critical error and could not load.</p>
          <div style={{ backgroundColor: '#fef2f2', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #fee2e2', marginTop: '1rem', overflowX: 'auto' }}>
            <code style={{ color: '#b91c1c', fontSize: '0.875rem' }}>
              {this.state.error?.toString()}
            </code>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Router component that checks user type and routes appropriately
const AppRouter: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isPartner, setIsPartner] = useState(false);
  const [isOnClientPortalRoute, setIsOnClientPortalRoute] = useState(
    window.location.pathname.startsWith('/client-portal')
  );

  useEffect(() => {
    checkUserType();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const userType = session.user.user_metadata?.user_type;
        const partnerStatus = userType === 'partner';
        setIsPartner(partnerStatus);

        // If partner tries to access main app, redirect to client portal
        if (partnerStatus && !window.location.pathname.startsWith('/client-portal')) {
          window.location.href = '/client-portal';
        }
      } else {
        setIsPartner(false);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkUserType = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const userType = session.user.user_metadata?.user_type;
        const partnerStatus = userType === 'partner';
        setIsPartner(partnerStatus);

        // If partner tries to access main app, redirect to client portal
        if (partnerStatus && !window.location.pathname.startsWith('/client-portal')) {
          window.location.href = '/client-portal';
          return;
        }

        // If team member tries to access client portal login (not chat), redirect to main
        if (!partnerStatus && window.location.pathname === '/client-portal') {
          window.location.href = '/';
          return;
        }
      }
    } catch (error) {
      console.error('Error checking user type:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Route based on URL path
  // Partners can only access /client-portal/*
  // Team members access main app (and can view client portal for testing)
  if (isOnClientPortalRoute || isPartner) {
    return <ClientPortalApp />;
  }

  return <App />;
};

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </React.StrictMode>
  );
  console.log("Mount Successful");
} catch (e: any) {
  console.error("Mount Error:", e);
  const overlay = document.getElementById('error-overlay');
  const content = document.getElementById('error-content');
  if (overlay && content) {
    overlay.style.display = 'block';
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    const strong = document.createElement('strong');
    strong.textContent = 'Mount Failure: ';
    errorDiv.appendChild(strong);
    errorDiv.appendChild(document.createTextNode(e.message || 'Unknown error'));
    content.appendChild(errorDiv);
  }
}
