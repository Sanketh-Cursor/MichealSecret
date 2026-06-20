/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Globe, 
  User, 
  Mail, 
  FileText, 
  ChevronLeft, 
  Save, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  BookOpen 
} from 'lucide-react';
import { VaultEntry, SecureNote } from '../types';
import { encryptData, decryptData } from '../services/crypto';
import { evaluatePasswordStrength } from '../utils/strength';

// Pools for fast inline generator
const INLINE_POOL = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+-=';

interface VaultFormProps {
  onBack: () => void;
  onSavePassword: (entry: VaultEntry) => Promise<void>;
  onSaveNote: (note: SecureNote) => Promise<void>;
  masterKey: CryptoKey;
  
  // Optional editing items
  editingPasswordEntry?: VaultEntry;
  editingSecureNote?: SecureNote;
  initialType?: 'login' | 'note';
}

export default function VaultForm({
  onBack,
  onSavePassword,
  onSaveNote,
  masterKey,
  editingPasswordEntry,
  editingSecureNote,
  initialType = 'login'
}: VaultFormProps) {
  const [type, setType] = useState<'login' | 'note'>(
    editingSecureNote ? 'note' : editingPasswordEntry ? 'login' : initialType
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form Fields
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Load existing data if editing
  useEffect(() => {
    const decryptExisting = async () => {
      setLoading(true);
      setError('');
      try {
        if (editingPasswordEntry) {
          setTitle(editingPasswordEntry.title);
          setUrl(editingPasswordEntry.url);
          setUsername(editingPasswordEntry.username);
          setEmail(editingPasswordEntry.email);
          
          // Decrypt sensitive attributes
          const plainPassword = await decryptData(editingPasswordEntry.encryptedPassword, masterKey);
          const plainNotes = await decryptData(editingPasswordEntry.encryptedNotes, masterKey);
          
          setPassword(plainPassword);
          setNotes(plainNotes);
        } else if (editingSecureNote) {
          setTitle(editingSecureNote.title);
          
          const plainContent = await decryptData(editingSecureNote.encryptedContent, masterKey);
          setNotes(plainContent);
        }
      } catch (err) {
        console.error(err);
        setError('Security Decryption Error: Could not unlock credential details.');
      } finally {
        setLoading(false);
      }
    };

    if (editingPasswordEntry || editingSecureNote) {
      decryptExisting();
    }
  }, [editingPasswordEntry, editingSecureNote, masterKey]);

  // Generate a random secure password for the vault input inline
  const handleGenerateInline = () => {
    const randomInts = new Uint32Array(18); // 18 lengths
    window.crypto.getRandomValues(randomInts);
    let pass = '';
    for (let i = 0; i < 18; i++) {
      pass += INLINE_POOL[randomInts[i] % INLINE_POOL.length];
    }
    setPassword(pass);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a title.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (type === 'login') {
        // Create or Update Password Vault Entry
        const encryptedPassword = await encryptData(password, masterKey);
        const encryptedNotes = await encryptData(notes, masterKey);

        const savedEntry: VaultEntry = {
          id: editingPasswordEntry?.id || Math.random().toString(36).substring(2) + Date.now().toString(36),
          title: title.trim(),
          url: url.trim(),
          username: username.trim(),
          email: email.trim(),
          encryptedPassword,
          encryptedNotes,
          createdAt: editingPasswordEntry?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        await onSavePassword(savedEntry);
      } else {
        // Create or Update Secure Note
        const encryptedContent = await encryptData(notes, masterKey);

        const savedNote: SecureNote = {
          id: editingSecureNote?.id || Math.random().toString(36).substring(2) + Date.now().toString(36),
          title: title.trim(),
          encryptedContent,
          createdAt: editingSecureNote?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        await onSaveNote(savedNote);
      }
      onBack();
    } catch (err) {
      console.error(err);
      setError('Symmetric AES-256 process failed unexpectedly.');
    } finally {
      setLoading(false);
    }
  };

  const strength = evaluatePasswordStrength(password);

  const getStrengthBadgeColor = () => {
    switch (strength.score) {
      case 0: return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/25';
      case 1: return 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/25';
      case 2: return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/25';
      case 3: return 'text-emerald-600 bg-emerald-55 dark:text-emerald-400 dark:bg-emerald-950/25';
      case 4: return 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/25';
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto" id="edit-entry-screen">
      
      {/* Back button header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors py-1.5 px-3 rounded-lg bg-slate-100/50 dark:bg-zinc-900 border border-slate-200/40 dark:border-zinc-850"
          id="btn-back-to-dashboard"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Dash</span>
        </button>
        <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500">
          {editingPasswordEntry || editingSecureNote ? 'Editing Mode' : 'New Vault Item'}
        </span>
      </div>

      <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 rounded-3xl shadow-lg p-5 md:p-6 space-y-6">
        
        {/* Type Selectors - Only during Creation */}
        {!(editingPasswordEntry || editingSecureNote) && (
          <div className="flex gap-2.5 p-1 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200/40 dark:border-zinc-850">
            <button
              onClick={() => setType('login')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                type === 'login'
                  ? 'bg-white dark:bg-zinc-950 text-indigo-750 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              id="tab-select-login-type"
            >
              <Key className="w-4 h-4 text-indigo-500" />
              <span>Login Credentials</span>
            </button>
            <button
              onClick={() => setType('note')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                type === 'note'
                  ? 'bg-white dark:bg-zinc-950 text-indigo-750 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              id="tab-select-note-type"
            >
              <BookOpen className="w-4 h-4 text-teal-500" />
              <span>Secure Secret Note</span>
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-900/30 rounded-xl text-xs flex items-center gap-2">
            <span className="font-semibold">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Title Field (Common) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1" htmlFor="input-title">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Item Title</span>
            </label>
            <input
              id="input-title"
              type="text"
              required
              placeholder={type === 'login' ? 'e.g. My Personal Gmail' : 'e.g. Wi-Fi Router Admin Pass'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="block w-full py-2.5 px-3.5 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-medium"
              disabled={loading}
            />
          </div>

          {type === 'login' ? (
            <>
              {/* URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1" htmlFor="input-url">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>Website URL</span>
                </label>
                <input
                  id="input-url"
                  type="text"
                  placeholder="https://accounts.google.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="block w-full py-2.5 px-3.5 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-650 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-medium"
                  disabled={loading}
                />
              </div>

              {/* Username & Email in Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1" htmlFor="input-username">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Username</span>
                  </label>
                  <input
                    id="input-username"
                    type="text"
                    placeholder="myusername7"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full py-2.5 px-3.5 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:outline-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-sans"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1" htmlFor="input-email">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Email Address</span>
                  </label>
                  <input
                    id="input-email"
                    type="email"
                    placeholder="name@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full py-2.5 px-3.5 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:outline-indigo-500 text-slate-900 dark:text-zinc-100 transition-all"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password with inline generator */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    <span>Ciphertext Password</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateInline}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 transition-all"
                    id="btn-generate-password-inline"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate Strong</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="input-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter or generate code..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pr-10 py-2.5 px-3.5 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-650 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-mono"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    id="btn-toggle-password-inline-view"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password strength feedback inline */}
              {password.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-900 rounded-xl flex items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Security Ranking</span>
                      <span className={`px-2 py-0.5 rounded-sm font-semibold text-[10px] uppercase tracking-wider ${getStrengthBadgeColor()}`}>
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
                  </div>
                  {strength.score >= 3 && (
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                  )}
                </div>
              )}
            </>
          ) : null}

          {/* Secure Notes/Content (Login Notes / General Note) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1" htmlFor="input-notes">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{type === 'login' ? 'Encrypted Secure Notes' : 'Encrypted Content'}</span>
            </label>
            <textarea
              id="input-notes"
              rows={type === 'login' ? 4 : 8}
              placeholder={type === 'login' ? 'Security recovery codes, answers to safety queries...' : 'Banking secrets, secure server keys, home address configs...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="block w-full py-2.5 px-3.5 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-650 dark:focus:ring-indigo-500/20 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-sans leading-relaxed"
              disabled={loading}
            />
          </div>

          {/* Action buttons */}
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 font-bold py-3 px-4 rounded-xl text-white text-sm transition-all shadow-md hover:shadow-indigo-500/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 mt-2 cursor-pointer"
            disabled={loading}
            id="btn-save-vault-item"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save Secure Item</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
