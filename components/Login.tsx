
import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { BrandingConfig } from '../types';
import { supabase } from '../lib/supabaseClient';
import { ensureProfileExists } from '../services/databaseService';
import logoUrl from '../logo';

interface LoginProps {
  onLogin: (email: string) => void;
  branding: BrandingConfig;
}

const Login: React.FC<LoginProps> = ({ onLogin, branding }) => {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isConfigured, setIsConfigured] = useState(true);

  useEffect(() => {
    const checkConfig = async () => {
        try {
            const { error } = await supabase.auth.getSession();
            if (error && error.message.includes('API Key')) setIsConfigured(false);
        } catch (e) { setIsConfigured(false); }
    };
    checkConfig();
  }, []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });

      if (error) throw error;

      setSuccessMsg('Password reset email sent! Check your inbox (and spam folder).');
    } catch (err: any) {
      console.error('Reset password error:', err);
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        await handleForgotPassword(e);
        setLoading(false);
        return;
      }

      // Existing registered accounts only. Signup/temporary-password activation
      // is intentionally disabled server-side; do not query an anon allowlist.
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      if (!data.user || !data.session) throw new Error('Sign-in did not return a session. Please try again.');
      await ensureProfileExists(data.user.id, data.user.email, data.user.user_metadata?.full_name);
      onLogin(data.user.email || email);

    } catch (err: any) {
      console.error('Auth error:', err);
      let errorMsg = err.message || 'Authentication failed.';

      // Translate common Supabase errors to user-friendly messages
      if (errorMsg.includes('Invalid login credentials')) {
        errorMsg = 'Invalid email or password. Please try again or use "Forgot Password" below.';
      } else if (errorMsg.includes('Email not confirmed')) {
        errorMsg = 'Please check your email and click the confirmation link before signing in.';
      } else if (errorMsg.includes('Database error') || errorMsg.includes('Unexpected failure')) {
        errorMsg = 'Server error. Please try again in a few minutes. If this persists, contact support.';
      } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
        errorMsg = 'Too many login attempts. Please wait a few minutes before trying again.';
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-portal-dark flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-portal-accent/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-portal-accent/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <img src={logoUrl} alt="BrightForge" className="w-[250px] mx-auto mb-4" />
          <p className="text-portal-soft">
            {mode === 'login' && 'Sign in to access your team portal'}

            {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-portal-surface rounded-2xl border border-white/[0.07] p-8 shadow-xl">

        {!isConfigured && (
             <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-300">
                    <p className="font-bold">Configuration Required</p>
                    <p>The portal connection is unavailable. Please contact Ben.</p>
                </div>
             </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          <div className="space-y-2">
            <label className="block text-sm font-medium text-portal-text">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-portal-soft" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-portal-soft focus:outline-none focus:border-portal-accent focus:ring-1 focus:ring-portal-accent transition-colors"
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          {mode !== 'forgot' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-portal-text">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-portal-soft" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-portal-soft focus:outline-none focus:border-portal-accent focus:ring-1 focus:ring-portal-accent transition-colors"
                placeholder="Enter your password"
                required
              />
            </div>
          </div>
          )}

          {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium text-center">{error}</div>}
          {successMsg && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium text-center">{successMsg}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-portal-accent hover:brightness-110 text-white rounded-xl font-bold shadow-lg shadow-portal-accent/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                {mode === 'login' && 'Sign In'}

                {mode === 'forgot' && 'Send Reset Link'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
              className="w-full mt-3 text-sm text-portal-soft hover:text-portal-accent transition-colors"
            >
              Forgot your password?
            </button>
          )}
        </form>

        <div className="mt-6 text-center">
           {mode === 'forgot' ? (
             <button
               onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
               className="text-sm text-portal-accent hover:text-portal-accent-light font-medium transition-colors"
             >
               Back to Sign In
             </button>
           ) : (
             <p className="text-sm text-portal-soft">
               New access is arranged by Ben. Self-signup and temporary-password activation are not available here.
             </p>
           )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
