import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Eye, EyeOff, ShieldCheck, RefreshCw, Fingerprint } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { generateSalt, deriveMasterKey, computeVerificationHash, verifyMasterPassword } from '../services/crypto';
import { saveMasterPasswordConfig, getMasterPasswordConfig } from '../services/db';
import { evaluatePasswordStrength } from '../utils/strength';
import { Capacitor } from '@capacitor/core';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isInitialSetup: boolean;
  user: User | null;
  onUnlock: (masterKey: CryptoKey) => void;
}

export default function MasterPasswordModal({ isOpen, onClose, isInitialSetup, user, onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [rememberWithBiometrics, setRememberWithBiometrics] = useState(false);

  const strength = evaluatePasswordStrength(password);

  useEffect(() => {
    if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
      checkBiometrics();
    }
  }, []);

  const checkBiometrics = async () => {
    try {
      const { isAvailable } = await (Capacitor.Plugins as any).BiometricAuth.checkBiometricSupport();
      setIsBiometricAvailable(isAvailable);
    } catch (e) {
      console.warn("Biometrics not supported:", e);
    }
  };

  const handleBiometricUnlock = async () => {
    setError('');
    setLoading(true);
    try {
      const { password: storedPassword } = await (Capacitor.Plugins as any).BiometricAuth.getMasterPassword();
      const config = await getMasterPasswordConfig(user?.id || undefined);
      if (!config) throw new Error('No Master Password configured for this account.');

      const masterKey = await deriveMasterKey(storedPassword, config.salt);
      onUnlock(masterKey);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Biometric authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setLoading(false);
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || password.length < 12) {
      setError('Master Password must be at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Confirm password does not match.');
      return;
    }
    if (strength.score < 2) {
      setError('Choose a stronger Master Password.');
      return;
    }

    setLoading(true);
    try {
      const salt = generateSalt();
      const masterKey = await deriveMasterKey(password, salt);
      const verificationHash = await computeVerificationHash(masterKey);

      await saveMasterPasswordConfig({ salt, verificationHash }, user?.id || undefined);

      if (rememberWithBiometrics && isBiometricAvailable) {
        await (Capacitor.Plugins as any).BiometricAuth.setMasterPassword({ password });
      }

      setSuccess('Master Password configured.');
      setTimeout(() => onUnlock(masterKey), 600);
    } catch (err) {
      console.error(err);
      setError('Failed to initialize Master Password.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const config = await getMasterPasswordConfig(user?.id || undefined);
      if (!config) throw new Error('No Master Password configured for this account.');
      const ok = await verifyMasterPassword(password, config.salt, config.verificationHash);
      if (!ok) throw new Error('Invalid Master Password.');

      if (rememberWithBiometrics && isBiometricAvailable) {
        await (Capacitor.Plugins as any).BiometricAuth.setMasterPassword({ password });
      }

      const masterKey = await deriveMasterKey(password, config.salt);
      onUnlock(masterKey);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to unlock vault.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-lg">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-zinc-50 tracking-tight">
            {isInitialSetup ? 'Create Master Password' : 'Unlock Vault'}
          </h3>
          {!isInitialSetup && isBiometricAvailable && (
            <button
              onClick={handleBiometricUnlock}
              className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-xl transition-all active:scale-90"
              title="Unlock with Biometrics"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-6 leading-relaxed">
          {isInitialSetup
            ? 'Establish a zero-knowledge encryption master password. It cannot be recovered if lost.'
            : 'Enter your Master Password to decrypt and load your database.'}
        </p>

        <form onSubmit={isInitialSetup ? handleSetup : handleUnlock} className="space-y-3">
          <div>
            <label className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 dark:text-zinc-500 mb-1 block">
              Master Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-4 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
                placeholder={isInitialSetup ? 'Minimum 12 characters' : 'Enter Master Password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-indigo-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isInitialSetup && (
            <div>
              <label className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 dark:text-zinc-500 mb-1 block">
                Confirm Master Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full pl-4 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
                placeholder="Repeat Master Password"
              />
            </div>
          )}

          {isBiometricAvailable && (
            <div className="flex items-center gap-2 mt-3 p-3 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/30 rounded-xl">
              <input
                type="checkbox"
                id="rememberBiometric"
                checked={rememberWithBiometrics}
                onChange={(e) => setRememberWithBiometrics(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 transition-all cursor-pointer"
              />
              <label htmlFor="rememberBiometric" className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
                Enable Biometric Unlock
              </label>
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
          {success && <div className="text-sm text-emerald-600">{success}</div>}

          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-zinc-800 transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : isInitialSetup ? 'Initialize Vault' : 'Unlock Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
