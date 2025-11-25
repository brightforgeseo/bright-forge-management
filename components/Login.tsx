
import React, { useState, useEffect } from 'react';
import { Hexagon, Mail, Lock, ArrowRight, Loader2, AlertTriangle, User } from 'lucide-react';
import { BrandingConfig } from '../types';
import { supabase } from '../lib/supabaseClient';
import { checkAllowlist, verifyPreProvisionedUser, consumePreProvisionedUser } from '../services/databaseService';

interface LoginProps {
  onLogin: (email: string) => void;
  branding: BrandingConfig;
}

const Login: React.FC<LoginProps> = ({ onLogin, branding }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
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

      if (mode === 'login') {
          // 1. Attempt Standard Login
          const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });

          if (!loginError && data.user) {
              onLogin(data.user.email || email);
              return;
          }

          // 2. Smart Login (Pre-provisioned User)
          // If login failed, check if this is a pre-provisioned user with a temp password
          if (loginError) {
              const preUser = await verifyPreProvisionedUser(email, password);
              if (preUser) {
                  // Try to create account first (for new users)
                  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                      email,
                      password,
                      options: { data: { full_name: preUser.name } }
                  });

                  if (signUpError) {
                      // User already exists - they need a password reset
                      // We'll use the admin workaround: delete and recreate
                      if (signUpError.message.includes('already registered')) {
                          // Show message to contact admin for now
                          // The temp_password matched, so they are who they say they are
                          throw new Error(
                            "Your temp password is correct, but your account already exists with a different password. " +
                            "Please contact Ben to reset your password, or try the password you set when you first logged in."
                          );
                      }
                      throw new Error("Activation failed: " + signUpError.message);
                  }

                  // If successful, clear temp password and log them in
                  if (signUpData.session) {
                      await consumePreProvisionedUser(email);
                      onLogin(email);
                      return;
                  } else if (signUpData.user && !signUpData.session) {
                      // User created but needs email confirmation - try to sign in anyway
                      // (This happens when email confirmation is enabled)
                      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
                      if (!loginErr && loginData.session) {
                          await consumePreProvisionedUser(email);
                          onLogin(email);
                          return;
                      }
                      setSuccessMsg('Account activated! Please check your email for a confirmation link, then try logging in again.');
                      return;
                  }
              }
          }

          throw loginError;

      } else {
          // SIGN UP (Manual)
          if (!fullName.trim()) throw new Error('Please enter your full name.');
          
          // 1. Check Allowlist
          const isAllowed = await checkAllowlist(email);
          if (!isAllowed) {
            throw new Error('This email has not been authorized by the Owner. Please ask Ben for an invite.');
          }

          // 2. Create Account
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } }
          });

          if (error) throw error;

          setSuccessMsg('Account created! Logging you in...');
          if (data.user || data.session) {
              setTimeout(() => onLogin(email), 1500);
          } else {
              setSuccessMsg('Account created! Please check your email to verify.');
          }
      }

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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand-100/50 to-transparent -z-10"></div>
      
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-slideIn">
        <div className="p-8 text-center border-b border-slate-50 bg-white">
          <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-900/20 mx-auto mb-4 transform rotate-3">
            <Hexagon className="w-8 h-8 text-white" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{branding.companyName}</h1>
          <p className="text-slate-500 mt-2 text-sm">
             {mode === 'login' && 'Sign in to access your team portal'}
             {mode === 'signup' && 'Create your team account'}
             {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {!isConfigured && (
             <div className="bg-amber-50 border-b border-amber-100 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                    <p className="font-bold">Configuration Required</p>
                    <p>Please add your Supabase API Key to <code>lib/supabaseClient.ts</code>.</p>
                </div>
             </div>
        )}

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {mode === 'signup' && (
             <div className="space-y-2 animate-slideIn">
               <label className="block text-sm font-medium text-slate-700">Full Name</label>
               <div className="relative">
                 <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                 <input 
                    type="text" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
                    placeholder="e.g. Jane Doe"
                    required={mode === 'signup'}
                  />
               </div>
             </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          {mode !== 'forgot' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          )}

          {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100 text-center">{error}</div>}
          {successMsg && <div className="p-3 rounded-lg bg-green-50 text-green-600 text-sm font-medium border border-green-100 text-center">{successMsg}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                {mode === 'login' && 'Sign In'}
                {mode === 'signup' && 'Create Account'}
                {mode === 'forgot' && 'Send Reset Link'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
              className="w-full mt-3 text-sm text-slate-500 hover:text-brand-600"
            >
              Forgot your password?
            </button>
          )}
        </form>

        <div className="p-6 border-t border-slate-50 bg-slate-50/50 text-center space-y-2">
           {mode === 'forgot' ? (
             <button
               onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
               className="text-sm text-brand-600 hover:text-brand-700 font-medium"
             >
               Back to Sign In
             </button>
           ) : (
             <button
               onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccessMsg(''); }}
               className="text-sm text-brand-600 hover:text-brand-700 font-medium"
             >
               {mode === 'login' ? 'Invited to the team? Sign Up' : 'Already have an account? Sign In'}
             </button>
           )}
        </div>
      </div>
    </div>
  );
};

export default Login;
