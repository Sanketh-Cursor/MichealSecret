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
import { generateSalt, deriveMasterKey, computeVerificationHash, verifyMasterPassword } from '../services/crypto';
import { saveMasterPasswordConfig, getMasterPasswordConfig, syncCloud } from '../services/db';
import { evaluatePasswordStrength } from '../utils/strength';

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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

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
  
  // Brute force protection state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);

  // Strength check for setup
  const strength = evaluatePasswordStrength(password);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutTime > 0) {
      const timer = setInterval(() => {
        setLockoutTime((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutTime]);

  const handleSubmitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (lockoutTime > 0) {
      setError(`Locked out due to too many failed attempts. Try again in ${lockoutTime} seconds.`);
      return;
    }

    if (!password) {
      setError('Please provide a Master Password.');
      return;
    }

    if (password.length < 12) {
      setError('A strong Master Password must be at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Confirm password does not match.');
      return;
    }

    if (strength.score < 2) {
      setError('To protect your credentials, please choose a better Master Password (at least "Good").');
      return;
    }

    setLoading(true);
    try {
      // 1. Generate salt
      const salt = generateSalt();
      
      // 2. Derive cryptographically secure master key (PBKDF2, HMAC-SHA256, 600000 rounds)
      const masterKey = await deriveMasterKey(password, salt);
      
      // 3. Compute verification hash
      const verificationHash = await computeVerificationHash(masterKey);
      
      // 4. Persist to secure database (local or Supabase)
      await saveMasterPasswordConfig({
        salt,
        verificationHash
      }, user?.id || undefined);
      
      setSuccess('Vault encryption key established successfully!');
      setTimeout(() => {
        onAuthSuccess(masterKey);
      }, 1000);
    } catch (err) {
      console.error(err);
      setError('An error occurred while establishing your encryption vaults.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (lockoutTime > 0) {
      setError(`Brute-force protection: Access locked. Please wait ${lockoutTime} seconds.`);
      return;
    }

    if (!password) {
      setError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      const config = await getMasterPasswordConfig(user?.id || undefined);
      if (!config) {
        setError(
          user 
            ? 'No Cloud Vault settings detected. Please verify your account setup or establish a Master Password.'
            : 'No local Vault settings detected. Please reload.'
        );
        setLoading(false);
        return;
      }

      // Check password validity
      const isValid = await verifyMasterPassword(password, config.salt, config.verificationHash);
      
      if (isValid) {
        // Success! Reset brute force counter and establish key
        setFailedAttempts(0);
        const masterKey = await deriveMasterKey(password, config.salt);
        onAuthSuccess(masterKey);
      } else {
        // Failure! Increment attempts and enforce cool-down delay
        const attempts = failedAttempts + 1;
        setFailedAttempts(attempts);
        
        let delay = 0;
        if (attempts >= 5) {
          delay = 30; // 30s lockout after 5 fails
        } else if (attempts >= 3) {
          delay = 10; // 10s lockout after 3 fails
        } else {
          delay = 2; // Short 2s timing delay to prevent high-speed dictionary attacks
        }
        
        setLockoutTime(delay);
        setError(`Incorrect Master Password. Lockout enforced for ${delay} seconds to prevent brute-force entries.`);
      }
    } catch (err) {
      console.error(err);
      setError('Authentication failed. Encrypted data reading error.');
    } finally {
      setLoading(false);
    }
  };

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

  const getStrengthProgressColor = () => {
    switch (strength.score) {
      case 0: return 'text-red-500 bg-red-500/10';
      case 1: return 'text-orange-500 bg-orange-500/10';
      case 2: return 'text-yellow-600 bg-yellow-500/10';
      case 3: return 'text-emerald-600 bg-emerald-500/10';
      case 4: return 'text-teal-600 bg-teal-500/10';
      default: return 'text-slate-400 bg-slate-100';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-8 animate-fade-in" id="auth-screen">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 rounded-3xl shadow-xl overflow-hidden p-6 md:p-8 space-y-6">
        
        {/* Shield Visual Header */}
        <div className="text-center space-y-2 select-none">
          <div className="inline-flex items-center justify-center p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 mb-2">
            <Shield className="w-8 h-8 animate-pulse" />
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold font-sans tracking-tight text-slate-900 dark:text-zinc-50">
            {isInitialSetup ? 'Create Master Password' : 'Unlock Your Vault'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs mx-auto">
            {isInitialSetup 
              ? 'Establish an encryption master password. It cannot be recovered if lost.'
              : 'Enter your Master Password to decrypt and load your database.'}
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

        {error && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-900/30 rounded-xl text-xs flex items-start gap-2.5 animate-pulse animate-fade-in" id="auth-error-banner">
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in" id="auth-success-banner">
            <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5 animate-bounce" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        <form onSubmit={isInitialSetup ? handleSubmitSetup : handleSubmitUnlock} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-650 dark:text-zinc-400 flex items-center justify-between" htmlFor="master-pwd-input">
              <span>Master Password</span>
              {!isInitialSetup && lockoutTime > 0 && (
                <span className="text-red-500 font-mono font-bold animate-pulse">Lockout: {lockoutTime}s</span>
              )}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <Lock className="w-4.5 h-4.5" />
              </span>
              <input
                id="master-pwd-input"
                type={showPassword ? 'text' : 'password'}
                className="block w-full pl-10 pr-10 py-3 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl placeholder-slate-450 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
                placeholder={isInitialSetup ? 'At least 12 characters' : 'Enter standard key...'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || lockoutTime > 0}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                disabled={lockoutTime > 0}
                id="btn-toggle-password-view"
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>

          {isInitialSetup && password.length > 0 && (
            <div className="space-y-2 p-3 bg-slate-50 dark:bg-zinc-900/60 border border-slate-150 dark:border-zinc-900 rounded-xl animate-fade-in">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Security Rating</span>
                <span className={`px-2 py-0.5 rounded-md font-bold tracking-wide text-[10px] uppercase ${getStrengthProgressColor()}`}>
                  {strength.label}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden flex gap-0.5">
                {[0, 1, 2, 3, 4].map((step) => (
                  <div 
                    key={step} 
                    className={`h-full flex-1 transition-all duration-300 ${
                      step <= strength.score 
                        ? strength.score >= 3 
                          ? 'bg-emerald-500' 
                          : 'bg-yellow-500'
                        : 'bg-slate-200 dark:bg-zinc-800'
                    }`}
                  />
                ))}
              </div>
              {strength.suggestions.length > 0 && (
                <ul className="text-[10px] text-slate-500 dark:text-zinc-400 space-y-0.5 pl-3 list-disc font-sans leading-tight">
                  {strength.suggestions.slice(0, 2).map((sug, idx) => (
                    <li key={idx}>{sug}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isInitialSetup && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="text-xs font-semibold text-slate-650 dark:text-zinc-400" htmlFor="master-confirm-input">
                Confirm Master Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                  <Unlock className="w-4.5 h-4.5" />
                </span>
                <input
                  id="master-confirm-input"
                  type={showPassword ? 'text' : 'password'}
                  className="block w-full pl-10 py-3 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl placeholder-slate-455 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
                  placeholder="Repeat Master Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => { setIsForgotModalOpen(true); setForgotError(''); setForgotSuccess(''); }}
                  disabled={authLoading || forgotLoading}
                  className="text-xs text-slate-500 dark:text-zinc-400 hover:text-indigo-600"
                >
                  Forgot password?
                </button>

                {isPasskeySupported() && (
                  <button
                    type="button"
                    onClick={handleStartPasskey}
                    disabled={authLoading}
                    className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg hover:bg-indigo-100"
                  >
                    Sign in with Passkey
                  </button>
                )}
              </div>

              {forgotError && <div className="text-[11px] text-red-600">{forgotError}</div>}
              {forgotSuccess && <div className="text-[11px] text-emerald-600">{forgotSuccess}</div>}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 font-bold py-3 px-4 rounded-xl text-white text-sm transition-all shadow-md hover:shadow-indigo-500/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
            disabled={loading || lockoutTime > 0}
            id="btn-auth-submit"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : isInitialSetup ? (
              <>
                <ShieldCheck className="w-5 h-5" />
                <span>Initialize Salt & Setup Vault</span>
              </>
            ) : (
              <>
                <Unlock className="w-5 h-5" />
                <span>Decrypt & Open Vault</span>
              </>
            )}
          </button>
        </form>

        {/* Cryptography Compliance Footer */}
        <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-150 dark:border-zinc-900 p-4 rounded-2xl space-y-1.5 select-none">
          <h3 className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-zinc-500">
            Zero-Knowledge Cryptography compliance
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-normal font-sans">
            Authentication performs identity verification via <b>your secure User ID and Password</b>. Encryption executes inside your sandbox using derived keys with 600,000-round <b>PBKDF2-HMAC-SHA256</b> and 256-bit symmetric tags (<b>AES-GCM</b>). The cloud provider cannot view or access your secrets.
          </p>
        </div>

      </div>
    </div>
  );
}
