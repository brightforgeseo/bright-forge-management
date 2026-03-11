import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { saveEmailCredentials } from '../../services/clientPortalService';

interface OAuthCallbackProps {
  onComplete: (success: boolean, email?: string) => void;
}

const OAuthCallback: React.FC<OAuthCallbackProps> = ({ onComplete }) => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get URL parameters
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state'); // Partner ID
      const error = params.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Get provider from session storage
      const provider = sessionStorage.getItem('oauth_provider') as 'gmail' | 'outlook';
      const storedPartnerId = sessionStorage.getItem('oauth_partner_id');

      if (!provider || !storedPartnerId) {
        throw new Error('OAuth session expired. Please try again.');
      }

      // Verify state matches
      if (state !== storedPartnerId) {
        throw new Error('OAuth state mismatch. Please try again.');
      }

      setMessage('Exchanging authorization code...');

      // Call Supabase Edge Function to exchange code for tokens
      const { data, error: functionError } = await supabase.functions.invoke('oauth-callback', {
        body: {
          code,
          provider,
          partnerId: storedPartnerId,
          redirectUri: provider === 'gmail'
            ? `${window.location.origin}/client-portal/oauth/gmail/callback`
            : `${window.location.origin}/client-portal/oauth/outlook/callback`,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || 'Failed to exchange authorization code');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to connect email');
      }

      // Save credentials to database
      const saved = await saveEmailCredentials(
        storedPartnerId,
        provider,
        data.accessToken,
        data.refreshToken,
        data.expiresAt,
        data.email
      );

      if (!saved) {
        throw new Error('Failed to save email credentials');
      }

      // Clear session storage
      sessionStorage.removeItem('oauth_provider');
      sessionStorage.removeItem('oauth_partner_id');

      setStatus('success');
      setMessage(`Successfully connected ${data.email}`);

      // Redirect after a short delay
      setTimeout(() => {
        onComplete(true, data.email);
      }, 1500);

    } catch (err: any) {
      console.error('OAuth callback error:', err);
      setStatus('error');
      setMessage(err.message || 'Failed to connect email');

      // Clear session storage
      sessionStorage.removeItem('oauth_provider');
      sessionStorage.removeItem('oauth_partner_id');

      // Redirect after a short delay
      setTimeout(() => {
        onComplete(false);
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-portal-dark flex items-center justify-center p-4">
      <div className="bg-portal-surface rounded-2xl border border-white/[0.07] p-8 max-w-md w-full text-center">
        {status === 'processing' && (
          <>
            <div className="w-16 h-16 rounded-full bg-portal-accent/20 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-portal-accent animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Connecting Email</h2>
            <p className="text-portal-soft">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Email Connected!</h2>
            <p className="text-portal-soft">{message}</p>
            <p className="text-portal-soft text-sm mt-4">Redirecting to settings...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Connection Failed</h2>
            <p className="text-red-400">{message}</p>
            <p className="text-portal-soft text-sm mt-4">Redirecting to settings...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
