import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { ToastType } from '../../types';

interface ClientPortalLoginProps {
  onLoginSuccess: () => void;
  addToast: (type: ToastType, message: string) => void;
}

const ClientPortalLogin: React.FC<ClientPortalLoginProps> = ({ onLoginSuccess, addToast }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/client-portal`
        });

        if (resetError) throw resetError;

        setSuccessMsg('Password reset email sent! Check your inbox.');
        setLoading(false);
        return;
      }

      // Login
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) throw loginError;

      // Check if user is a partner
      if (data.user?.user_metadata?.user_type !== 'partner') {
        await supabase.auth.signOut();
        throw new Error('This portal is for partner accounts only. Please use the main portal.');
      }

      addToast('success', 'Welcome back!');
      onLoginSuccess();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-portal-dark flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-portal-accent/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-portal-accent/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <img
            src="https://brightforge.com.ph/images/logo.png"
            alt="BrightForge"
            className="h-12 mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-white mb-1">Client Portal</h1>
          <p className="text-portal-soft">BrightForge SEO</p>
        </div>

        {/* Login Card */}
        <div className="bg-portal-surface rounded-2xl border border-white/[0.07] p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-white mb-6">
            {mode === 'login' ? 'Sign in to your account' : 'Reset your password'}
          </h2>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-emerald-400 text-sm">{successMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-portal-text mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-portal-soft" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-12 pr-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-portal-soft focus:outline-none focus:border-portal-accent focus:ring-1 focus:ring-portal-accent transition-colors"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {mode === 'login' && (
              <div>
                <label className="block text-sm font-medium text-portal-text mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-portal-soft" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-12 pr-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-portal-soft focus:outline-none focus:border-portal-accent focus:ring-1 focus:ring-portal-accent transition-colors"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-portal-accent hover:brightness-110 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-portal-accent/20"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Send Reset Link'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            {mode === 'login' ? (
              <button
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-sm text-portal-soft hover:text-portal-accent transition-colors"
              >
                Forgot your password?
              </button>
            ) : (
              <button
                onClick={() => {
                  setMode('login');
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-sm text-portal-soft hover:text-portal-accent transition-colors"
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-portal-soft text-sm mt-8">
          Need access? Contact your account manager.
        </p>
      </div>
    </div>
  );
};

export default ClientPortalLogin;
