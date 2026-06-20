/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Lock, Unlock, Eye, EyeOff, AlertTriangle, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
import { generateSalt, deriveMasterKey, computeVerificationHash, verifyMasterPassword } from '../services/crypto';
import { saveMasterPasswordConfig, getMasterPasswordConfig } from '../services/db';
import { evaluatePasswordStrength } from '../utils/strength';

interface AuthScreenProps {
  onAuthSuccess: (masterKey: CryptoKey) => void;
  isInitialSetup: boolean;
}

export default function AuthScreen({ onAuthSuccess, isInitialSetup }: AuthScreenProps) {
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
      
      // 4. Persist to secure local database
      await saveMasterPasswordConfig({
        salt,
        verificationHash
      });
      
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
      const config = await getMasterPasswordConfig();
      if (!config) {
        setError('No Vault settings detected. Please reload.');
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
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold font-sans tracking-tight text-slate-900 dark:text-zinc-50">
            {isInitialSetup ? 'Create Master Password' : 'Unlock Your Vault'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs mx-auto">
            {isInitialSetup 
              ? 'Establish a master password. It cannot be recovered if lost.'
              : 'Enter your Master Password to decrypt and load your database.'}
          </p>
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
                  className="block w-full pl-10 py-3 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl placeholder-slate-450 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
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
            Military-Grade Security Engineering
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed font-sans">
            Derived keys employ hardware-accelerated <b>PBKDF2-HMAC-SHA256</b> (600,000 rounds) generating distinct 256-bit symmetric tags. Symmetric storage operations utilize verified, authenticated **AES-256-GCM** inside the client execution box. No server connection is engaged (Full local-first offline isolation).
          </p>
        </div>

      </div>
    </div>
  );
}
