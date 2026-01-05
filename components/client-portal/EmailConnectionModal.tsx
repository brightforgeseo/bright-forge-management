import React, { useState } from 'react';
import {
  X,
  Mail,
  Loader2,
  AlertCircle,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { PartnerAccount } from '../../types-portal';
import { ToastType } from '../../types';

interface EmailConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  partnerAccount: PartnerAccount;
  onConnected: (provider: 'gmail' | 'outlook', email: string) => void;
  addToast: (type: ToastType, message: string) => void;
}

// Gmail OAuth configuration
const GMAIL_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '1093075047200-mrpnqhebclmc7o5082hvh6uugm5g3gsv.apps.googleusercontent.com';
const GMAIL_REDIRECT_URI = `${window.location.origin}/client-portal/oauth/gmail/callback`;
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

// Outlook OAuth configuration
const OUTLOOK_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const OUTLOOK_REDIRECT_URI = `${window.location.origin}/client-portal/oauth/outlook/callback`;
const OUTLOOK_SCOPE = 'https://graph.microsoft.com/Mail.Send offline_access';

const EmailConnectionModal: React.FC<EmailConnectionModalProps> = ({
  isOpen,
  onClose,
  partnerAccount,
  onConnected,
  addToast,
}) => {
  const [isConnecting, setIsConnecting] = useState<'gmail' | 'outlook' | null>(null);

  const handleGmailConnect = () => {
    if (!GMAIL_CLIENT_ID) {
      addToast('error', 'Gmail integration is not configured. Please contact support.');
      return;
    }

    setIsConnecting('gmail');

    // Store partner ID in session storage for callback
    sessionStorage.setItem('oauth_partner_id', partnerAccount.id);
    sessionStorage.setItem('oauth_provider', 'gmail');

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      redirect_uri: GMAIL_REDIRECT_URI,
      response_type: 'code',
      scope: GMAIL_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state: partnerAccount.id,
    });

    // Open OAuth popup or redirect
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const handleOutlookConnect = () => {
    if (!OUTLOOK_CLIENT_ID) {
      addToast('error', 'Outlook integration is not configured. Please contact support.');
      return;
    }

    setIsConnecting('outlook');

    // Store partner ID in session storage for callback
    sessionStorage.setItem('oauth_partner_id', partnerAccount.id);
    sessionStorage.setItem('oauth_provider', 'outlook');

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      redirect_uri: OUTLOOK_REDIRECT_URI,
      response_type: 'code',
      scope: OUTLOOK_SCOPE,
      state: partnerAccount.id,
    });

    // Open OAuth popup or redirect
    window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Connect Email</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-zinc-400 text-sm">
            Connect your email account to send emails directly to your clients. Choose your email provider:
          </p>

          {/* Gmail Button */}
          <button
            onClick={handleGmailConnect}
            disabled={isConnecting !== null}
            className="w-full flex items-center gap-4 p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6">
                <path
                  fill="#EA4335"
                  d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z"
                />
                <path
                  fill="#34A853"
                  d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z"
                />
                <path
                  fill="#4A90E2"
                  d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z"
                />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-white">Connect Gmail</p>
              <p className="text-sm text-zinc-400">Use your Google account</p>
            </div>
            {isConnecting === 'gmail' ? (
              <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
            ) : (
              <ExternalLink className="w-5 h-5 text-zinc-500" />
            )}
          </button>

          {/* Outlook Button */}
          <button
            onClick={handleOutlookConnect}
            disabled={isConnecting !== null}
            className="w-full flex items-center gap-4 p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-[#0078d4] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white">
                <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-white">Connect Outlook</p>
              <p className="text-sm text-zinc-400">Use your Microsoft account</p>
            </div>
            {isConnecting === 'outlook' ? (
              <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
            ) : (
              <ExternalLink className="w-5 h-5 text-zinc-500" />
            )}
          </button>

          {/* Privacy Note */}
          <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50 flex items-start gap-3">
            <Shield className="w-5 h-5 text-zinc-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-400">
              We only request permission to send emails on your behalf. We never read your inbox or
              access any of your existing emails.
            </p>
          </div>

          {/* Not Configured Warning */}
          {(!GMAIL_CLIENT_ID && !OUTLOOK_CLIENT_ID) && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 text-sm font-medium">Email integration not configured</p>
                <p className="text-amber-400/70 text-sm mt-1">
                  Please contact your account manager to set up email integration.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailConnectionModal;
