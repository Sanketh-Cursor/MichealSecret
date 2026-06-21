import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Eye, EyeOff, ShieldCheck, RefreshCw } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { generateSalt, deriveMasterKey, computeVerificationHash, verifyMasterPassword } from '../services/crypto';
import { saveMasterPasswordConfig, getMasterPasswordConfig } from '../services/db';
import { evaluatePasswordStrength } from '../utils/strength';

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

  const strength = evaluatePasswordStrength(password);

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
        <h3 className="text-lg font-bold mb-2">{isInitialSetup ? 'Create Master Password' : 'Unlock Vault'}</h3>
        <p className="text-sm text-slate-500 mb-4">{isInitialSetup ? 'Establish an encryption master password. It cannot be recovered if lost.' : 'Enter your Master Password to decrypt and load your database.'}</p>

        <form onSubmit={isInitialSetup ? handleSetup : handleUnlock} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Master Password</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-3 pr-10 py-2 border rounded-lg bg-slate-50 dark:bg-zinc-900"
                placeholder={isInitialSetup ? 'At least 12 characters' : 'Enter Master Password'}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1.5 text-slate-500">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isInitialSetup && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Confirm Master Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full mt-1 pl-3 pr-3 py-2 border rounded-lg bg-slate-50 dark:bg-zinc-900"
                placeholder="Repeat Master Password"
              />
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
          {success && <div className="text-sm text-emerald-600">{success}</div>}

          <div className="flex items-center justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-slate-100">Cancel</button>
            <button type="submit" disabled={loading} className="px-3 py-2 rounded-lg bg-indigo-600 text-white">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : isInitialSetup ? 'Initialize Vault' : 'Unlock Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
