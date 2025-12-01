import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

console.log("Starting Application Mount...");

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

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
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
    // Use textContent instead of innerHTML to prevent XSS
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    const strong = document.createElement('strong');
    strong.textContent = 'Mount Failure: ';
    errorDiv.appendChild(strong);
    errorDiv.appendChild(document.createTextNode(e.message || 'Unknown error'));
    content.appendChild(errorDiv);
  }
}