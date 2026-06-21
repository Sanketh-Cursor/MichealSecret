/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Lock, 
  Unlock, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  RefreshCw,
  Sparkles,
  CloudLightning,
  LogOut,
  UserCheck,
  UserPlus
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { supabase, sendPasswordResetEmail, isPasskeySupported, startPasskeySignIn, startPasskeyRegistration } from '../services/supabase';
import { syncCloud } from '../services/db';

interface AuthScreenProps {
  onAuthSuccess: (masterKey: CryptoKey) => void;
  isInitialSetup: boolean;
  user: User | null;
  onSignOut: () => Promise<void>;
}

export default function AuthScreen({ 
  onAuthSuccess, 
  isInitialSetup, 
  user, 
  onSignOut
}: AuthScreenProps) {
  // Master password is collected after cloud login; not on main screen.

  // Cloud replicator authentication states
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmailInput, setForgotEmailInput] = useState('');
  
  // Note: master-password handling is moved to a dedicated modal shown after cloud login.

  const handleCloudAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    
    if (!authEmail || !authPassword) {
      setAuthError('Please provide both User ID (Email) and Password.');
      return;
    }

    if (authPassword.length < 6) {
      setAuthError('Account password must be at least 6 characters.');
      return;
    }

    setAuthLoading(true);
    try {
      if (isSignUpMode) {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        if (data.user) {
          if (data.session) {
            setAuthSuccessMsg('Account created! Local cache synchronized to your cloud workspace.');
            await syncCloud(data.user.id);
          } else {
            setAuthSuccessMsg('Registration successful! Please confirm your email to activate cloud synchronization, or start using immediately.');
            await syncCloud(data.user.id);
          }
        }
      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        if (data.user) {
          setAuthSuccessMsg('Successfully logged in! Restoring cloud database sync.');
          await syncCloud(data.user.id);
        }
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Authentication failed.';
      setAuthError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (email?: string) => {
    setForgotError('');
    setForgotSuccess('');
    const targetEmail = (email || forgotEmailInput || authEmail || '').trim();
    if (!targetEmail) {
      setForgotError('Please provide an email to reset password.');
      return;
    }
    setForgotLoading(true);
    try {
      await sendPasswordResetEmail(targetEmail, window.location.origin);
      setForgotSuccess('Password reset email sent — check your inbox.');
      setIsForgotModalOpen(false);
      setForgotEmailInput('');
    } catch (err: any) {
      console.error(err);
      setForgotError(err?.message || 'Failed to send password reset email.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleStartPasskey = async () => {
    try {
      if (!authEmail) throw new Error('Enter your account email to use passkey sign-in.');
      const result = await startPasskeySignIn(authEmail);
      // Expect server to return session or token which you should handle according to your auth flow
      setAuthSuccessMsg('Passkey sign-in successful.');
      console.log('Passkey sign-in result:', result);
    } catch (err: any) {
      console.error('Passkey flow error:', err);
      setAuthError(err?.message || 'Passkey flow not available.');
    }
  };

  const handleRegisterPasskey = async () => {
    try {
      if (!user || !user.email) throw new Error('You must be signed in to register a passkey.');
      const result = await startPasskeyRegistration(user.email);
      setAuthSuccessMsg('Passkey registered successfully.');
      console.log('Passkey registration result:', result);
    } catch (err: any) {
      console.error('Passkey registration error:', err);
      setAuthError(err?.message || 'Failed to register passkey.');
    }
  };

  const handleCloudSignOut = async () => {
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccessMsg('');
    try {
      await onSignOut();
      setAuthSuccessMsg('Account disconnected. Reverting to Offline Sandbox.');
    } catch (err) {
      console.error(err);
      setAuthError('Failed to safely log out.');
    } finally {
      setAuthLoading(false);
    }
  };


  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-8 animate-fade-in" id="auth-screen">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 rounded-3xl shadow-xl overflow-hidden p-6 md:p-8 space-y-6">
        
        {/* Shield Visual Header (Logo Area) */}
        <div className="text-center space-y-2 select-none">
          <div className="inline-flex items-center justify-center p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-3xl border border-indigo-100 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 mb-2 shadow-sm">
            <ShieldCheck className="w-10 h-10 animate-pulse" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black font-sans tracking-tight text-slate-900 dark:text-zinc-50">
            Key Keeper
          </h1>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 max-w-xs mx-auto">
            Sign in to your cloud account to sync and access your vault. Master Password will be requested after login.
          </p>
        </div>

        {/* Forgot Password Modal */}
        {isForgotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md bg-white dark:bg-zinc-950 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-lg">
              <h3 className="text-lg font-bold mb-2">Reset Password</h3>
              <p className="text-[12px] text-slate-500 mb-4">Enter the account email to receive a password reset link.</p>
              <div className="mb-3">
                <input
                  type="email"
                  value={forgotEmailInput}
                  onChange={(e) => setForgotEmailInput(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsForgotModalOpen(false); setForgotEmailInput(''); setForgotError(''); }}
                  className="px-3 py-2 rounded-lg text-sm bg-slate-100 dark:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleForgotPassword()}
                  disabled={forgotLoading}
                  className="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white"
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Email'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CLOUD SECURE BACKUP ACCOUNT CONTAINER */}
        <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-150 dark:border-zinc-900 p-4 rounded-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-900/50 pb-2">
            <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-slate-450 dark:text-zinc-500 flex items-center gap-1.5 font-mono">
              <CloudLightning className="w-3.5 h-3.5 text-indigo-550 dark:text-indigo-400" />
              <span>Cloud Backup Account Registry</span>
            </h3>
            {user && (
              <span className="text-[9px] font-bold text-emerald-555 dark:text-emerald-400 bg-emerald-500/10 py-0.5 px-2 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Active Connection
              </span>
            )}
          </div>

          {authError && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-900/30 rounded-xl text-[10px] flex items-start gap-2 animate-fade-in" id="cloud-auth-error">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-semibold">{authError}</span>
            </div>
          )}

          {authSuccessMsg && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30 rounded-xl text-[10px] flex items-start gap-2 animate-fade-in" id="cloud-auth-success">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-semibold">{authSuccessMsg}</span>
            </div>
          )}
          
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-200/50 dark:border-zinc-800/60 shadow-xs">
                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-xs">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 leading-normal">
                  <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 dark:text-zinc-500">Security Principal</p>
                  <p className="text-xs font-bold text-slate-805 dark:text-zinc-200 truncate font-mono">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleRegisterPasskey}
                    disabled={authLoading}
                    className="text-slate-500 hover:text-indigo-600 p-2 rounded-xl transition-all shadow-xs border border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 text-xs"
                    title="Register a passkey for this account"
                    id="btn-register-passkey"
                  >
                    Register Passkey
                  </button>
                  <button
                    type="button"
                    onClick={handleCloudSignOut}
                    disabled={authLoading}
                    className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-2 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer shadow-xs border border-slate-100 dark:border-zinc-800/80 shrink-0 select-none bg-white dark:bg-zinc-900 active:scale-[0.97]"
                    title="Disconnect Cloud Backup"
                    id="btn-disconnect-cloud-replicated"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-normal leading-relaxed">
                You are currently signed in with email/password authentication. Secure AES-256 cloud replication is healthy and active.
              </p>
            </div>
          ) : (
            <form onSubmit={handleCloudAuth} className="space-y-3 animate-fade-in">
              <div className="flex gap-2 bg-slate-100/60 dark:bg-zinc-900 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setIsSignUpMode(false); setAuthError(''); setAuthSuccessMsg(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    !isSignUpMode
                      ? 'bg-white dark:bg-zinc-850 text-indigo-700 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setIsSignUpMode(true); setAuthError(''); setAuthSuccessMsg(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    isSignUpMode
                      ? 'bg-white dark:bg-zinc-850 text-indigo-700 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'
                  }`}
                >
                  Register
                </button>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                    <UserCheck className="w-3.5 h-3.5" />
                  </span>
                  <input
                    id="cloud-userid-input"
                    type="email"
                    required
                    placeholder="User ID (Email Address)"
                    className="block w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-slate-205 dark:border-zinc-850 rounded-xl placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    disabled={authLoading}
                  />
                </div>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                  <input
                    id="cloud-password-input"
                    type={showAuthPassword ? 'text' : 'password'}
                    required
                    placeholder="Account Password"
                    className="block w-full pl-9 pr-9 py-2 text-xs bg-white dark:bg-zinc-900 border border-slate-205 dark:border-zinc-850 rounded-xl placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    disabled={authLoading}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-indigo-600 transition-colors"
                    onClick={() => setShowAuthPassword(!showAuthPassword)}
                    id="btn-toggle-auth-pwd"
                  >
                    {showAuthPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                id="btn-cloud-auth-submit"
              >
                {authLoading ? (
                  <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                ) : isSignUpMode ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Account & Sync</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Authorize Cloud & Sync</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
