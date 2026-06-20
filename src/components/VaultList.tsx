/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Search, 
  Key, 
  BookOpen, 
  Copy, 
  Check, 
  Trash2, 
  Edit, 
  Eye, 
  EyeOff, 
  ExternalLink,
  Plus,
  ArrowUpDown,
  FileCheck,
  Sparkles,
  Clipboard,
  X,
  Lock
} from 'lucide-react';
import { VaultEntry, SecureNote } from '../types';
import { decryptData } from '../services/crypto';

interface VaultListProps {
  entries: VaultEntry[];
  notes: SecureNote[];
  masterKey: CryptoKey;
  onAddLogin: () => void;
  onAddNote: () => void;
  onEditLogin: (entry: VaultEntry) => void;
  onEditNote: (note: SecureNote) => void;
  onDeleteLogin: (id: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

export default function VaultList({
  entries,
  notes,
  masterKey,
  onAddLogin,
  onAddNote,
  onEditLogin,
  onEditNote,
  onDeleteLogin,
  onDeleteNote
}: VaultListProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'login' | 'note'>('all');
  const [sortBy, setSortBy] = useState<'alpha' | 'created' | 'updated'>('alpha');

  // Detail Modal / Expansion State
  const [activeItem, setActiveItem] = useState<{ type: 'login' | 'note', item: any } | null>(null);
  const [decryptedPassword, setDecryptedPassword] = useState('');
  const [decryptedNotes, setDecryptedNotes] = useState('');
  const [decryptedContent, setDecryptedContent] = useState('');
  const [revealedSecure, setRevealedSecure] = useState(false);
  const [revealNotes, setRevealNotes] = useState(false);

  // Clipboard auto-clear state
  const [clipProgress, setClipProgress] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Timers
  useEffect(() => {
    let intervalId: any;
    if (clipProgress > 0) {
      intervalId = setInterval(() => {
        setClipProgress(prev => {
          if (prev <= 1) {
            // Overwrite physical clipboard to protect keys
            try {
              navigator.clipboard.writeText("--- CLIPBOARD CLEARED FOR SECURITY ---");
            } catch (err) {
              console.warn("Could not overwrite clipboard due to focus constraints.", err);
            }
            setCopiedField(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [clipProgress]);

  const triggerClipboardSave = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(identifier);
    setClipProgress(30); // 30 seconds timer
  };

  // On item select, reset expansion decryption
  const handleSelectItem = async (type: 'login' | 'note', item: any) => {
    setActiveItem({ type, item });
    setDecryptedPassword('');
    setDecryptedNotes('');
    setDecryptedContent('');
    setRevealedSecure(false);
    setRevealNotes(false);
  };

  // Perform on-demand decryption (Secure OWASP practice)
  const handleDecryptDetails = async () => {
    if (!activeItem || !masterKey) return;
    try {
      if (activeItem.type === 'login') {
        const pass = await decryptData(activeItem.item.encryptedPassword, masterKey);
        const notesPlain = await decryptData(activeItem.item.encryptedNotes, masterKey);
        setDecryptedPassword(pass);
        setDecryptedNotes(notesPlain);
      } else {
        const contentPlain = await decryptData(activeItem.item.encryptedContent, masterKey);
        setDecryptedContent(contentPlain);
      }
      setRevealedSecure(true);
    } catch (err) {
      console.error(err);
      alert('AES decrypt of details failed.');
    }
  };

  // Filter & Search entries
  const matchesSearch = (text: string) => text.toLowerCase().includes(search.toLowerCase());

  const filteredLogins = entries.filter(
    (e) => matchesSearch(e.title) || matchesSearch(e.url) || matchesSearch(e.username) || matchesSearch(e.email)
  );

  const filteredNotes = notes.filter((n) => matchesSearch(n.title));

  // Combine items for 'all' lists
  let combinedItems: { type: 'login' | 'note', id: string, title: string, subtitle: string, dateCreated: number, dateUpdated: number, original: any }[] = [];

  if (filterType === 'all' || filterType === 'login') {
    filteredLogins.forEach(item => {
      combinedItems.push({
        type: 'login',
        id: item.id,
        title: item.title,
        subtitle: item.username || item.email || item.url || 'No identity details',
        dateCreated: item.createdAt,
        dateUpdated: item.updatedAt,
        original: item
      });
    });
  }

  if (filterType === 'all' || filterType === 'note') {
    filteredNotes.forEach(item => {
      combinedItems.push({
        type: 'note',
        id: item.id,
        title: item.title,
        subtitle: 'Secure Secret Note',
        dateCreated: item.createdAt,
        dateUpdated: item.updatedAt,
        original: item
      });
    });
  }

  // Sorting
  combinedItems.sort((a, b) => {
    if (sortBy === 'alpha') {
      return a.title.localeCompare(b.title);
    } else if (sortBy === 'created') {
      return b.dateCreated - a.dateCreated;
    } else {
      return b.dateUpdated - a.dateUpdated;
    }
  });

  const getInitialStyle = (title: string) => {
    const firstChar = title.trim().charAt(0).toUpperCase();
    if ('AEIOUY'.includes(firstChar)) {
      return 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400';
    }
    if ('BCDF'.includes(firstChar)) {
      return 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400';
    }
    if ('GHJK'.includes(firstChar)) {
      return 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400';
    }
    if ('LMNP'.includes(firstChar)) {
      return 'bg-teal-50 text-teal-650 dark:bg-teal-950/20 dark:text-teal-400';
    }
    if ('QRST'.includes(firstChar)) {
      return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400';
    }
    return 'bg-slate-50 text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-400';
  };

  return (
    <div className="space-y-6" id="dashboard-vault-view">
      
      {/* Dynamic Security Countdown Banner */}
      {clipProgress > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-150/40 dark:border-indigo-900/20 p-2.5 px-4 rounded-xl flex items-center justify-between text-xs animate-fade-in shadow-xs" id="clipboard-countdown-container">
          <div className="flex items-center gap-2">
            <Clipboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            <span className="font-semibold text-slate-705 dark:text-zinc-300 select-none">
              Sensitive clip payload detected! Auto-sanitizing clipboard cache.
            </span>
          </div>
          <span className="font-mono bg-indigo-650 dark:bg-indigo-600 text-white dark:text-zinc-100 font-bold px-2.5 py-0.5 rounded-md select-none">
            {clipProgress}s remaining
          </span>
        </div>
      )}

      {/* Stats and Top Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 p-5 rounded-2xl shadow-xs">
        {/* Statistics info */}
        <div className="flex items-center gap-6">
          <div className="space-y-0.5 text-left border-r pr-6 border-slate-200 dark:border-zinc-800 select-none">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">Vault Logins</div>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-zinc-100 font-mono leading-none mt-1">{entries.length}</div>
          </div>
          <div className="space-y-0.5 text-left select-none">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">Secure Notes</div>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-zinc-100 font-mono leading-none mt-1">{notes.length}</div>
          </div>
        </div>

        {/* Action triggers */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={onAddLogin}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md hover:shadow-indigo-500/10 active:scale-97 cursor-pointer"
            id="btn-add-primary-login"
          >
            <Plus className="w-4 h-4" />
            <span>Add Login</span>
          </button>
          
          <button
            onClick={onAddNote}
            className="inline-flex items-center gap-1.5 border border-slate-205 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 text-xs font-bold py-2.5 px-4 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-900 transition-all cursor-pointer"
            id="btn-add-primary-note"
          >
            <BookOpen className="w-4 h-4" />
            <span>Add Note</span>
          </button>
        </div>
      </div>

      {/* Filter Options, Sorting and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
        {/* Search */}
        <div className="relative md:col-span-5">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search credentials, websites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-9.5 pr-3.5 py-2.5 text-xs bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-550/10 focus:border-indigo-600 dark:focus:ring-indigo-500/10 dark:focus:border-indigo-500 text-slate-900 dark:text-zinc-100 transition-all font-sans"
            id="search-input-field"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex gap-1 md:col-span-4 bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200/40 dark:border-zinc-850">
          {(['all', 'login', 'note'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`flex-1 py-1.5 text-xs font-bold capitalize rounded-lg transition-all ${
                filterType === t
                  ? 'bg-white dark:bg-zinc-950 text-indigo-700 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              id={`tab-filter-${t}`}
            >
              {t === 'all' ? 'All Items' : t === 'login' ? 'Logins' : 'Secret Notes'}
            </button>
          ))}
        </div>

        {/* Sorting Dropdown selector */}
        <div className="relative md:col-span-3 flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-450 shrink-0 select-none" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="block w-full py-2.5 px-2.5 text-xs font-semibold bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 text-slate-700 dark:text-zinc-300 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-600/20 cursor-pointer"
            id="sorting-select-dropdown"
          >
            <option value="alpha">Sort: Alphabetical</option>
            <option value="created">Sort: Created Date</option>
            <option value="updated">Sort: Last Modified</option>
          </select>
        </div>
      </div>

      {/* Main Grid display list */}
      {combinedItems.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 rounded-3xl p-8 space-y-3 select-none">
          <div className="inline-flex items-center justify-center p-4 bg-slate-50 dark:bg-zinc-900/60 rounded-full text-slate-400 dark:text-zinc-500">
            <X className="w-7 h-7 animate-pulse" />
          </div>
          <h3 className="font-extrabold text-slate-800 dark:text-zinc-200 text-sm">No vault matches found</h3>
          <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs mx-auto">
            Build your credential storage by clicking "Add Login" or "Add Note" controls above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="vault-items-grid">
          {combinedItems.map((itemObj) => (
            <div
              key={itemObj.id}
              onClick={() => handleSelectItem(itemObj.type, itemObj.original)}
              className={`bg-white dark:bg-zinc-950 hover:bg-indigo-50/5 dark:hover:bg-indigo-950/5 border border-slate-200 dark:border-zinc-900 p-4.5 rounded-2xl shadow-xs hover:shadow-md cursor-pointer transition-all flex items-center justify-between text-left group border-l-4 ${
                itemObj.type === 'login' ? 'border-l-indigo-600' : 'border-l-teal-500'
              }`}
              id={`vault-card-${itemObj.id}`}
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                {/* Dynamic avatar box */}
                <div className={`w-10 h-10 ${getInitialStyle(itemObj.title)} rounded-xl flex items-center justify-center font-bold text-xs font-mono shrink-0 shadow-xs`}>
                  {itemObj.title.slice(0, 2).trim().toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 select-none">
                  <h3 className="font-bold text-sm text-slate-800 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {itemObj.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono truncate mt-0.5">
                    {itemObj.subtitle}
                  </p>
                </div>
              </div>
              
              {/* Right side status */}
              <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                  {new Date(itemObj.dateUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                {itemObj.type === 'login' ? (
                  <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 text-[9px] font-extrabold uppercase rounded-md tracking-wider">Login</span>
                ) : (
                  <span className="px-2 py-0.5 bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-400 text-[9px] font-extrabold uppercase rounded-md tracking-wider">Note</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded item Drawer/Modal (Demand-Based decryption for top safety) */}
      {activeItem && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="vault-item-details-modal">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-850 rounded-3xl p-6 shadow-2xl relative space-y-5 text-left animate-slide-up">
            
            {/* Modal Exit */}
            <button
              onClick={() => setActiveItem(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-lg transition-colors"
              id="btn-close-details-modal"
            >
              <X className="w-5 h-5 animate-spin-once" />
            </button>

            {/* Header with Type label */}
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-zinc-900 mr-8">
              <span className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-900">
                {activeItem.type === 'login' ? (
                  <Key className="w-5 h-5 text-indigo-650 dark:text-indigo-400" />
                ) : (
                  <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                )}
              </span>
              <div>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-zinc-100">
                  {activeItem.item.title}
                </h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-black mt-0.5">
                  {activeItem.type === 'login' ? 'Login Credential' : 'Secure Secret Note'}
                </p>
              </div>
            </div>

            {/* Core on-demand Decrypt block */}
            {!revealedSecure ? (
              <div className="border border-indigo-100 dark:border-indigo-900/40 rounded-2xl bg-slate-50/50 dark:bg-zinc-900/40 p-6 flex flex-col items-center text-center gap-3">
                <Lock className="w-8 h-8 text-indigo-600 dark:text-indigo-405" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200">Sensitive Cryptographic Shell</h4>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 max-w-[280px]">
                    To comply with OWASP Memory Standards, plaintext values are kept clean and fully encrypted. Decrypt in memory as needed below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDecryptDetails}
                  className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs transition-all flex items-center gap-1.5 mt-1 cursor-pointer"
                  id="btn-reveal-details-modal"
                >
                  <Eye className="w-4 h-4" />
                  <span>Reveal Plaintexts</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs animate-fade-in">
                {activeItem.type === 'login' ? (
                  <div className="space-y-3.5">
                    {/* Website URL */}
                    {activeItem.item.url && (
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-zinc-500">Website Address</span>
                        <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl relative">
                          <span className="font-mono text-slate-700 dark:text-zinc-300 truncate pr-5 select-all">{activeItem.item.url}</span>
                          <a
                            href={activeItem.item.url.startsWith('http') ? activeItem.item.url : `https://${activeItem.item.url}`}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 rounded-sm"
                            title="Visit website"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Username */}
                    {activeItem.item.username && (
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-zinc-500">Username ID</span>
                        <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl relative">
                          <span className="font-mono text-slate-700 dark:text-zinc-300 truncate pr-5 select-all">{activeItem.item.username}</span>
                          <button
                            onClick={() => triggerClipboardSave(activeItem.item.username, 'username')}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-405 hover:text-indigo-600 rounded-md transition-colors"
                            title="Copy username"
                          >
                            {copiedField === 'username' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Email */}
                    {activeItem.item.email && (
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-zinc-500">Email Address</span>
                        <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl relative">
                          <span className="font-mono text-slate-700 dark:text-zinc-300 truncate pr-5 select-all">{activeItem.item.email}</span>
                          <button
                            onClick={() => triggerClipboardSave(activeItem.item.email, 'email')}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 hover:text-indigo-650 rounded-md transition-colors"
                            title="Copy email"
                          >
                            {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Decrypted Password */}
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-zinc-500">Plaintext Password</span>
                      <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl relative">
                        <span className="font-mono font-bold text-slate-700 dark:text-zinc-150 select-all break-all pr-12">
                          {decryptedPassword || '--- Empty ---'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button
                            onClick={() => triggerClipboardSave(decryptedPassword, 'password')}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-805 text-slate-400 hover:text-indigo-650 rounded-md transition-colors"
                            title="Copy password to clipboard (auto-clears in 30s!)"
                            id="btn-copy-modal-password"
                          >
                            {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Notes Inside Login */}
                    {decryptedNotes && (
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-zinc-500">Encrypted Notes Details</span>
                        <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl max-h-40 overflow-y-auto relative font-sans leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-zinc-300 text-xs">
                          {decryptedNotes}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Secure Note plain content
                  <div className="space-y-1.5 text-xs">
                    <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-zinc-500">Secure Note Cipher Content</span>
                    <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl max-h-60 overflow-y-auto leading-relaxed whitespace-pre-wrap font-sans text-slate-700 dark:text-zinc-300 relative text-xs">
                      {decryptedContent || 'No notes included.'}
                    </div>
                    {decryptedContent && (
                      <div className="flex justify-end mt-1">
                        <button
                          onClick={() => triggerClipboardSave(decryptedContent, 'note-content')}
                          className="inline-flex items-center justify-center gap-1 py-1 px-2.5 border border-slate-200 dark:border-zinc-850 bg-white dark:bg-zinc-950 text-[10px] text-slate-650 hover:text-indigo-650 rounded-lg shadow-xs"
                          title="Copy notes content"
                        >
                          {copiedField === 'note-content' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span>Copied Notes</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Notes</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Card dates info footprint */}
                <div className="pt-2 text-[10px] text-slate-400 dark:text-zinc-500 flex justify-between select-none border-t border-slate-100 dark:border-zinc-900 mt-2">
                  <span>Created: {new Date(activeItem.item.createdAt).toLocaleString()}</span>
                  <span>Modified: {new Date(activeItem.item.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Modal Controls Footer */}
            <div className="flex gap-2.5 pt-3.5 border-t border-slate-100 dark:border-zinc-900 mt-4">
              <button
                type="button"
                onClick={() => {
                  const typeLocal = activeItem.type;
                  const itemLocal = activeItem.item;
                  setActiveItem(null);
                  if (typeLocal === 'login') {
                    onEditLogin(itemLocal);
                  } else {
                    onEditNote(itemLocal);
                  }
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                id="btn-edit-modal-item"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Item</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (confirm(`Do you wish to permanently delete the "${activeItem.item.title}" credential?`)) {
                    const localType = activeItem.type;
                    const localId = activeItem.item.id;
                    setActiveItem(null);
                    if (localType === 'login') {
                      await onDeleteLogin(localId);
                    } else {
                      await onDeleteNote(localId);
                    }
                  }
                }}
                className="p-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-650 rounded-xl transition-all border border-red-200/20"
                title="Delete credential"
                id="btn-delete-modal-item"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
