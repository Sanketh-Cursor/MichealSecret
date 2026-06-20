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
  UserCheck
} from 'lucide-react';
import { User } from 'firebase/auth';
import { generateSalt, deriveMasterKey, computeVerificationHash, verifyMasterPassword } from '../services/crypto';
import { saveMasterPasswordConfig, getMasterPasswordConfig } from '../services/db';
import { evaluatePasswordStrength } from '../utils/strength';

interface AuthScreenProps {
  onAuthSuccess: (masterKey: CryptoKey) => void;
  isInitialSetup: boolean;
  user: User | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
}

export default function AuthScreen({ 
  onAuthSuccess, 
  isInitialSetup, 
  user, 
  onGoogleSignIn, 
  onGoogleSignOut 
}: AuthScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
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
      
      // 4. Persist to secure database (local or Firestore)
      await saveMasterPasswordConfig({
        salt,
        verificationHash
      }, user?.uid || undefined);
      
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
      const config = await getMasterPasswordConfig(user?.uid || undefined);
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

        {/* GOOGLE OAUTH 2.0 INTEGRATION CONTAINER */}
        <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-150 dark:border-zinc-900 p-4 rounded-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-slate-450 dark:text-zinc-500 flex items-center gap-1.5 font-mono">
              <CloudLightning className="w-3.5 h-3.5 text-indigo-550 dark:text-indigo-400" />
              <span>Google OAuth 2.0 Cloud Backup</span>
            </h3>
            {user && (
              <span className="text-[9px] font-bold text-emerald-555 dark:text-emerald-400 bg-emerald-500/10 py-0.5 px-2 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Cloud Connected
              </span>
            )}
          </div>
          
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-200/50 dark:border-zinc-800/60 shadow-xs">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'Google user'} className="w-7 h-7 rounded-full shrink-0 border border-slate-205 dark:border-zinc-800" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs uppercase shadow-sm">
                    {user.email?.charAt(0) || 'G'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-805 dark:text-zinc-200 truncate">{user.displayName || 'Google Account'}</p>
                  <p className="text-[10px] text-slate-455 dark:text-zinc-450 truncate font-mono">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                  title="Disconnect Google"
                  id="btn-disconnect-google"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-450 leading-relaxed leading-normal">
                You are currently signed in with Google OAuth 2.0. Your database is securely backed up and synced in real-time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-normal">
                Enable cloud replication to access your encrypted vaults seamlessly across multiple devices under dual-identity protection.
              </p>
              
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="w-full bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-850/80 text-slate-700 dark:text-zinc-200 border border-slate-250 dark:border-zinc-800 font-bold py-2 px-3 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                id="btn-google-sign-in"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.63c-.29 1.5-.1.3-.1 2.37l-3.35 2.24 3.25 2.52c1.9-1.75 3-4.32 3-7.23z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.83-2.97c-1.08.73-2.48 1.16-4.1 1.16-3.15 0-5.81-2.13-6.76-5l-3.95 3.06C3.26 21.03 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.24 14.28c-.24-.73-.38-1.5-.38-2.28s.14-1.55.38-2.28L1.29 6.66C.47 8.3 0 10.1 0 12s.47 3.7 1.29 5.34l3.95-3.06z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.97 1.29 6.66l3.95 3.06c.95-2.87 3.61-5 6.76-5z"
                  />
                </svg>
                <span>Authorize & Unlock with Google</span>
              </button>
            </div>
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
            Authentication performs identity checking via <b>Google OAuth 2.0</b>. Encryption executes inside your sandbox using derived keys with 600,000-round <b>PBKDF2-HMAC-SHA256</b> and 256-bit symmetric tags (<b>AES-GCM</b>). The cloud provider cannot view or access your secrets.
          </p>
        </div>

      </div>
    </div>
  );
}
