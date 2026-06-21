/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  Key, 
  Settings, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw,
  Cloud,
  LogOut,
  Sliders,
  Database
} from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface CompatUser extends User {
  uid: string;
}

import { AppSettings, VaultEntry, SecureNote } from './types';
import { 
  getAppSettings, 
  getVaultEntries, 
  getSecureNotes, 
  getMasterPasswordConfig, 
  saveVaultEntry, 
  saveSecureNote, 
  deleteVaultEntry, 
  deleteSecureNote,
  syncCloud
} from './services/db';
import { supabase } from './services/supabase';

// Subcomponents
import AuthScreen from './components/AuthScreen';
import MasterPasswordModal from './components/MasterPasswordModal';
import VaultList from './components/VaultList';
import VaultForm from './components/VaultForm';
import Generator from './components/Generator';
import SettingsScreen from './components/SettingsScreen';

export default function App() {
  // Initialization state
  const [dbChecking, setDbChecking] = useState(true);
  const [isInitialSetup, setIsInitialSetup] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);

  // Supabase Auth state
  const [user, setUser] = useState<CompatUser | null>(null);

  // App settings state
  const [settings, setSettings] = useState<AppSettings>({
    autoLockDuration: 15,
    theme: 'light',
  });

  // Cached entries (decrypted on demand inside list items)
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [notes, setNotes] = useState<SecureNote[]>([]);

  // Navigation state
  const [activeTab, setActiveTab] = useState<'vault' | 'generator' | 'settings'>('vault');
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Editing state
  const [editingPasswordEntry, setEditingPasswordEntry] = useState<VaultEntry | undefined>(undefined);
  const [editingSecureNote, setEditingSecureNote] = useState<SecureNote | undefined>(undefined);
  const [formInitialType, setFormInitialType] = useState<'login' | 'note'>('login');

  // Activity tracking
  const lastActiveRef = useRef<number>(Date.now());

  // 1. Listen to Supabase Auth state shifts and load corresponding configuration
  useEffect(() => {
    // Initial user check
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;
      const compatUser = currentUser ? { ...currentUser, uid: currentUser.id } as CompatUser : null;
      setUser(compatUser);
      setDbChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user || null;
      const compatUser = currentUser ? { ...currentUser, uid: currentUser.id } as CompatUser : null;
      setUser(compatUser);
      try {
        const config = await getMasterPasswordConfig(compatUser?.uid || undefined);
        setIsInitialSetup(!config);

        const loadedSettings = await getAppSettings(compatUser?.uid || undefined);
        setSettings(loadedSettings);

        // If currently unlocked, swap lists to current auth partition
        if (isUnlocked && masterKey) {
          const allEntries = await getVaultEntries(compatUser?.uid || undefined);
          const allNotes = await getSecureNotes(compatUser?.uid || undefined);
          setEntries(allEntries);
          setNotes(allNotes);
        }
      } catch (err) {
        console.error("Authentication listener sync check failed:", err);
      } finally {
        setDbChecking(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isUnlocked, masterKey]);

  // Sync index.html root body dark theme class
  useEffect(() => {
    const rootClassList = document.documentElement.classList;
    if (settings.theme === 'dark') {
      rootClassList.add('dark');
    } else {
      rootClassList.remove('dark');
    }
  }, [settings.theme]);

  // 2. Background State auto-lock & user focus tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isUnlocked) {
        // Immediate session destruction on backing out
        handleLockVault();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isUnlocked]);

  // 3. Keep track of user interaction to mitigate auto-locks
  useEffect(() => {
    if (!isUnlocked) return;

    const resetActivity = () => {
      lastActiveRef.current = Date.now();
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, resetActivity);
    });

    const checkInterval = setInterval(() => {
      if (settings.autoLockDuration === 0) return; // Never Lock

      const idleDurationMs = settings.autoLockDuration * 60 * 1000;
      if (Date.now() - lastActiveRef.current > idleDurationMs) {
        handleLockVault();
      }
    }, 10000); // Check idle state every 10 seconds

    return () => {
      activityEvents.forEach(evt => {
        window.removeEventListener(evt, resetActivity);
      });
      clearInterval(checkInterval);
    };
  }, [isUnlocked, settings.autoLockDuration]);

  // Load decrypted index vault lists
  const refreshVaultData = async () => {
    try {
      const allEntries = await getVaultEntries(user?.uid || undefined);
      const allNotes = await getSecureNotes(user?.uid || undefined);
      setEntries(allEntries);
      setNotes(allNotes);
    } catch (err) {
      console.error("Failed to parse cached database entries", err);
    }
  };

  const handleUnlockSuccess = async (derivedKey: CryptoKey) => {
    setMasterKey(derivedKey);
    setIsUnlocked(true);
    lastActiveRef.current = Date.now();
    
    // Fetch user items
    const allEntries = await getVaultEntries(user?.uid || undefined);
    const allNotes = await getSecureNotes(user?.uid || undefined);
    setEntries(allEntries);
    setNotes(allNotes);
  };

  const handleLockVault = () => {
    // Nullify standard credentials securely to protect memory footprints
    setMasterKey(null);
    setIsUnlocked(false);
    setEntries([]);
    setNotes([]);
    setIsFormOpen(false);
    setEditingPasswordEntry(undefined);
    setEditingSecureNote(undefined);
  };

  const handleFactoryReset = () => {
    handleLockVault();
    setIsInitialSetup(true);
    setActiveTab('vault');
  };

  // Account Auth Actions
  const handleSignOut = async () => {
    try {
      setDbChecking(true);
      handleLockVault();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Disconnect error:", err);
    } finally {
      setDbChecking(false);
    }
  };

  // CRUD Actions
  const handleSavePassword = async (entry: VaultEntry) => {
    await saveVaultEntry(entry, user?.uid || undefined);
    await refreshVaultData();
  };

  const handleSaveNote = async (note: SecureNote) => {
    await saveSecureNote(note, user?.uid || undefined);
    await refreshVaultData();
  };

  const handleDeletePassword = async (id: string) => {
    await deleteVaultEntry(id, user?.uid || undefined);
    await refreshVaultData();
  };

  const handleDeleteNote = async (id: string) => {
    await deleteSecureNote(id, user?.uid || undefined);
    await refreshVaultData();
  };

  // Render components inline
  if (dbChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
          <span className="text-xs font-mono font-medium tracking-wider text-slate-500 dark:text-zinc-400">Loading Crypto Environments...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={settings.theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans transition-colors duration-300 flex flex-col lg:flex-row">
        
        {/* Navigation Sidebar - Only visible when unlocked on desktop screens */}
        {isUnlocked && (
          <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-100 flex-col shrink-0 min-h-screen select-none sticky top-0 h-screen justify-between border-r border-slate-800">
            <div className="flex-grow">
              <div className="p-6 flex items-center gap-3 border-b border-slate-800/60">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="font-extrabold text-white tracking-tight text-lg">Key Keeper</span>
                  <span className="text-[9px] font-mono text-indigo-400 font-bold uppercase tracking-wider">Cloud Synchronized</span>
                </div>
              </div>
              <nav className="px-4 py-6 space-y-1">
                <button
                  onClick={() => { setActiveTab('vault'); setIsFormOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'vault' && !isFormOpen
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                  id="sidebar-nav-vault"
                >
                  <Key className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>All Items</span>
                </button>

                <button
                  onClick={() => { setActiveTab('generator'); setIsFormOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'generator' && !isFormOpen
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                  id="sidebar-nav-generator"
                >
                  <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>Generator</span>
                </button>

                <button
                  onClick={() => { setActiveTab('settings'); setIsFormOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'settings' && !isFormOpen
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                  id="sidebar-nav-settings"
                >
                  <Settings className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>Settings</span>
                </button>
              </nav>
            </div>

            {/* User profile details in sidebar if logged in */}
            <div className="p-4 space-y-3">
              {user && (
                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0 border border-indigo-500/20">
                    {user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0 flex-1 leading-normal">
                    <p className="text-xs font-bold text-white truncate">{user.email?.split('@')[0] || 'Client Profile'}</p>
                    <p className="text-[10px] text-indigo-400 truncate font-mono">{user.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="text-slate-400 hover:text-red-400 transition-colors p-1"
                    title="Sign Out Account"
                    id="btn-sidebar-signout"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="bg-indigo-600/10 border border-indigo-500/10 rounded-xl p-4">
                <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider mb-1">Vault Status</p>
                <p className="text-white text-xs font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  {user ? 'Secured Cloud Active' : 'Offline sandbox active'}
                </p>
                <div className="mt-2.5 w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 w-full h-full"></div>
                </div>
                <p className="text-slate-500 text-[9px] mt-2 leading-relaxed">
                  {user ? 'Cloud Database sync: Verified via Firestore Rules' : 'Offline sandbox active (AES-256)'}
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Main section: contains Header and Viewport */}
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          {/* Top Header Controls bar */}
          <header className="sticky top-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-slate-200 dark:border-zinc-900/80 z-40 select-none h-16 flex items-center">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
              
              {/* Logo (On mobile: normal brand; On desktop: Page status context statement) */}
              <div className="flex items-center gap-2">
                <div className="lg:hidden flex items-center gap-2">
                  <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h1 className="font-sans font-black text-sm tracking-tight text-slate-900 dark:text-zinc-100">
                    Key Keeper
                  </h1>
                </div>

                {isUnlocked && (
                  <div className="hidden lg:block text-left leading-tight">
                    <h2 className="font-bold text-slate-805 dark:text-zinc-100 text-base tracking-tight capitalize">
                      {isFormOpen ? 'Edit Item' : activeTab === 'vault' ? 'All Items' : activeTab === 'generator' ? 'Password Generator' : 'Vault Settings'}
                    </h2>
                    <p className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 dark:text-zinc-500">
                      {user ? 'Secure Replication Container' : 'Symmetric Local Storage Sandbox'}
                    </p>
                  </div>
                )}

                {!isUnlocked && (
                  <div className="text-left leading-tight">
                    <h1 className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-zinc-100">
                      Secure Password Vault
                    </h1>
                    <p className="text-[9px] font-mono text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                      Zero-Knowledge Authentication Engine
                    </p>
                  </div>
                )}
              </div>

              {/* Locked/Unlocked Action states */}
              {isUnlocked && (
                <div className="flex items-center gap-3">
                  {user && (
                    <span className="hidden leading-normal md:inline-flex items-center gap-1 text-[10px] font-mono font-black uppercase text-indigo-600 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20 dark:text-indigo-400">
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Cloud Syncing</span>
                    </span>
                  )}
                  
                  <button
                    onClick={handleLockVault}
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-white dark:text-zinc-100 text-xs font-bold py-2 px-3.5 rounded-lg transition-all cursor-pointer shadow-sm"
                    id="btn-quick-lock-vault"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock Vault</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Main content body */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24">
            {!isUnlocked ? (
              <>
                <AuthScreen 
                  onAuthSuccess={handleUnlockSuccess} 
                  isInitialSetup={isInitialSetup} 
                  user={user}
                  onSignOut={handleSignOut}
                />
                {/* When user is signed into cloud but vault is locked, ask for Master Password */}
                <MasterPasswordModal
                  isOpen={!!user && !isUnlocked}
                  onClose={() => { /* no-op: require unlock or sign out */ }}
                  isInitialSetup={isInitialSetup}
                  user={user}
                  onUnlock={handleUnlockSuccess}
                />
              </>
            ) : (
              <div className="space-y-6">
                
                {/* Mobile Navigation Tabs List */}
                {!isFormOpen && (
                  <div className="flex lg:hidden bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-205 dark:border-zinc-850 select-none pb-1.5 mb-2">
                    <button
                      onClick={() => setActiveTab('vault')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                        activeTab === 'vault'
                          ? 'bg-white dark:bg-zinc-950 text-indigo-700 dark:text-indigo-405 shadow-xs'
                          : 'text-slate-500 hover:text-slate-805 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                      id="nav-tab-vault"
                    >
                      Vault
                    </button>

                    <button
                      onClick={() => setActiveTab('generator')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                        activeTab === 'generator'
                          ? 'bg-white dark:bg-zinc-950 text-indigo-700 dark:text-indigo-405 shadow-xs'
                          : 'text-slate-500 hover:text-slate-805 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                      id="nav-tab-generator"
                    >
                      Generator
                    </button>

                    <button
                      onClick={() => setActiveTab('settings')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                        activeTab === 'settings'
                          ? 'bg-white dark:bg-zinc-950 text-indigo-700 dark:text-indigo-405 shadow-xs'
                          : 'text-slate-500 hover:text-slate-805 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                      id="nav-tab-settings"
                    >
                      Settings
                    </button>
                  </div>
                )}

                {/* Subview Renders */}
                {isFormOpen ? (
                  <VaultForm
                    masterKey={masterKey!}
                    onBack={() => {
                      setIsFormOpen(false);
                      setEditingPasswordEntry(undefined);
                      setEditingSecureNote(undefined);
                    }}
                    onSavePassword={handleSavePassword}
                    onSaveNote={handleSaveNote}
                    editingPasswordEntry={editingPasswordEntry}
                    editingSecureNote={editingSecureNote}
                    initialType={formInitialType}
                  />
                ) : (
                  <>
                    {activeTab === 'vault' && (
                      <VaultList
                        entries={entries}
                        notes={notes}
                        masterKey={masterKey!}
                        onAddLogin={() => {
                          setFormInitialType('login');
                          setIsFormOpen(true);
                        }}
                        onAddNote={() => {
                          setFormInitialType('note');
                          setIsFormOpen(true);
                        }}
                        onEditLogin={(entry) => {
                          setEditingPasswordEntry(entry);
                          setIsFormOpen(true);
                        }}
                        onEditNote={(note) => {
                          setEditingSecureNote(note);
                          setIsFormOpen(true);
                        }}
                        onDeleteLogin={handleDeletePassword}
                        onDeleteNote={handleDeleteNote}
                      />
                    )}

                    {activeTab === 'generator' && <Generator />}

                    {activeTab === 'settings' && (
                      <SettingsScreen
                        settings={settings}
                        onSettingsUpdate={setSettings}
                        onFactoryReset={handleFactoryReset}
                        masterKey={masterKey}
                        userId={user?.uid || undefined}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </main>

          {/* Global Client status footer */}
          <footer className="fixed bottom-0 inset-x-0 lg:left-64 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xs py-2 text-center text-[10px] text-slate-400 dark:text-zinc-500 border-t border-slate-200 dark:border-zinc-900 select-none z-30 flex items-center justify-center gap-1.5 font-mono font-bold tracking-wide">
            <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-indigo-505 animate-bounce' : 'bg-emerald-500 animate-pulse'}`} />
            <span>
              {user 
                ? `CLOUD STORAGE SECURED: COMPLIANT WITH ZERO-KNOWLEDGE STANDARDS (${user.email})` 
                : 'ZERO-KNOWLEDGE CLIENT BOX (LOCAL ISOLATION ACTIVE)'}
            </span>
          </footer>
        </div>

      </div>
    </div>
  );
}
