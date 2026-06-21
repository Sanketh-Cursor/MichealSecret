/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultEntry, SecureNote, AppSettings, MasterPasswordConfig } from '../types';
import { supabase } from './supabase';

const DB_NAME = 'LocalPasswordManagerDB';
const DB_VERSION = 1;

/**
 * DATABASE STORAGE - SECURITY & HYBRID PARADIGMS
 * 
 * DESIGN DECISIONS & SECURITY STANDARDS:
 * 1. Hybrid Client-Cloud Persistence:
 *    - By default, user state is sandboxed inside local IndexedDB.
 *    - When authenticated via email and password with Supabase Auth, data securely synchronizes with Supabase.
 *    - To maintain absolute secrecy, sensitive fields (passwords, notes content) are fully encrypted in AES-256-GCM
 *      prior to syncing to Supabase. Plaintext Master Passwords are never sent across the network.
 * 2. Identity Sandboxing in Cloud:
 *    - Document records are isolated using user_id foreign keys, fully secured under Supabase Row-Level Security.
 *    - User A cannot view, write, or find User B's vault items.
 */

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // Store: Master Password Configuration (Salt + Verification Hash)
      if (!db.objectStoreNames.contains('auth_config')) {
        db.createObjectStore('auth_config', { keyPath: 'id' });
      }

      // Store: Vault Entries (credentials)
      if (!db.objectStoreNames.contains('vault_entries')) {
        db.createObjectStore('vault_entries', { keyPath: 'id' });
      }

      // Store: Secure Notes
      if (!db.objectStoreNames.contains('secure_notes')) {
        db.createObjectStore('secure_notes', { keyPath: 'id' });
      }

      // Store: Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open database'));
    };
  });
}

// Helper to execute operations on an object store
async function getStore(storeName: string, mode: IDBTransactionMode): Promise<{ store: IDBObjectStore, transaction: IDBTransaction }> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  return { store, transaction };
}

/* ==========================================================================
   Master Password / Auth Operations
   ========================================================================== */

export async function saveMasterPasswordConfig(config: MasterPasswordConfig, userId?: string): Promise<void> {
  if (userId) {
    const { error } = await supabase
      .from('auth_config')
      .upsert({
        user_id: userId,
        salt: config.salt,
        verification_hash: config.verificationHash
      });
    if (error) {
      console.error("Supabase upsert master password config error:", error);
      throw new Error("Supabase Sync Failed: " + error.message);
    }
    return;
  }

  const { store } = await getStore('auth_config', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({ id: 'config', ...config });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMasterPasswordConfig(userId?: string): Promise<MasterPasswordConfig | null> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('auth_config')
        .select('salt, verification_hash')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        throw error;
      }
      
      if (data) {
        return {
          salt: data.salt,
          verificationHash: data.verification_hash
        };
      }
      return null;
    } catch (err) {
      console.error("Supabase loading of config failed, fallback to local:", err);
    }
  }

  const { store } = await getStore('auth_config', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.get('config');
    request.onsuccess = () => {
      resolve(request.result ? { salt: request.result.salt, verificationHash: request.result.verificationHash } : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/* ==========================================================================
   AppSettings Operations
   ========================================================================== */

export async function saveAppSettings(settings: AppSettings, userId?: string): Promise<void> {
  if (userId) {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        auto_lock_duration: settings.autoLockDuration,
        theme: settings.theme
      });
    if (error) {
      console.error("Supabase upsert settings error:", error);
      throw new Error("Supabase Sync Failed: " + error.message);
    }
    return;
  }

  const { store } = await getStore('settings', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({ id: 'app_settings', ...settings });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAppSettings(userId?: string): Promise<AppSettings> {
  const defaultSettings: AppSettings = {
    autoLockDuration: 15, // 15 minutes by default
    theme: 'light',
  };

  if (userId) {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('auto_lock_duration, theme')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        return {
          autoLockDuration: data.auto_lock_duration ?? 15,
          theme: data.theme ?? 'light'
        };
      }
    } catch (err) {
      console.error("Supabase loading of settings failed, fallback:", err);
    }
  }

  try {
    const { store } = await getStore('settings', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get('app_settings');
      request.onsuccess = () => {
        resolve(request.result ? { autoLockDuration: request.result.autoLockDuration, theme: request.result.theme } : defaultSettings);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return defaultSettings;
  }
}

/* ==========================================================================
   VaultEntries / Credentials CRUD
   ========================================================================== */

export async function getVaultEntries(userId?: string): Promise<VaultEntry[]> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('vault_entries')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      
      if (data) {
        return data.map(item => ({
          id: item.id,
          title: item.title,
          url: item.url,
          username: item.username,
          email: item.email,
          encryptedPassword: typeof item.encrypted_password === 'string' ? JSON.parse(item.encrypted_password) : item.encrypted_password,
          encryptedNotes: typeof item.encrypted_notes === 'string' ? JSON.parse(item.encrypted_notes) : item.encrypted_notes,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }));
      }
      return [];
    } catch (err) {
      console.error("Supabase loading of vault entries failed, fallback to local:", err);
    }
  }

  const { store } = await getStore('vault_entries', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVaultEntry(entry: VaultEntry, userId?: string): Promise<void> {
  if (userId) {
    const { error } = await supabase
      .from('vault_entries')
      .upsert({
        id: entry.id,
        user_id: userId,
        title: entry.title,
        url: entry.url,
        username: entry.username,
        email: entry.email,
        encrypted_password: entry.encryptedPassword,
        encrypted_notes: entry.encryptedNotes,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt
      });
    if (error) {
      console.error("Supabase upsert vault entry error:", error);
      throw new Error("Supabase Sync Failed: " + error.message);
    }
    return;
  }

  const { store } = await getStore('vault_entries', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteVaultEntry(id: string, userId?: string): Promise<void> {
  if (userId) {
    const { error } = await supabase
      .from('vault_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      console.error("Supabase delete vault entry error:", error);
      throw new Error("Supabase Sync Failed: " + error.message);
    }
    return;
  }

  const { store } = await getStore('vault_entries', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* ==========================================================================
   SecureNotes CRUD
   ========================================================================== */

export async function getSecureNotes(userId?: string): Promise<SecureNote[]> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('secure_notes')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      if (data) {
        return data.map(item => ({
          id: item.id,
          title: item.title,
          encryptedContent: typeof item.encrypted_content === 'string' ? JSON.parse(item.encrypted_content) : item.encrypted_content,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }));
      }
      return [];
    } catch (err) {
      console.error("Supabase loading of secure notes failed, fallback to local:", err);
    }
  }

  const { store } = await getStore('secure_notes', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSecureNote(note: SecureNote, userId?: string): Promise<void> {
  if (userId) {
    const { error } = await supabase
      .from('secure_notes')
      .upsert({
        id: note.id,
        user_id: userId,
        title: note.title,
        encrypted_content: note.encryptedContent,
        created_at: note.createdAt,
        updated_at: note.updatedAt
      });
    if (error) {
      console.error("Supabase upsert secure note error:", error);
      throw new Error("Supabase Sync Failed: " + error.message);
    }
    return;
  }

  const { store } = await getStore('secure_notes', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(note);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSecureNote(id: string, userId?: string): Promise<void> {
  if (userId) {
    const { error } = await supabase
      .from('secure_notes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      console.error("Supabase delete secure note error:", error);
      throw new Error("Supabase Sync Failed: " + error.message);
    }
    return;
  }

  const { store } = await getStore('secure_notes', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/* ==========================================================================
   Full Vault Reset (Standard factory wipe)
   ========================================================================== */

export async function clearAllVaultData(userId?: string): Promise<void> {
  // Reset the client-side IndexedDB Cache immediately.
  const dbInst = await openDatabase();
  const stores = ['auth_config', 'vault_entries', 'secure_notes', 'settings'];
  const transaction = dbInst.transaction(stores, 'readwrite');
  
  stores.forEach(storeName => {
    transaction.objectStore(storeName).clear();
  });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/* ==========================================================================
   Migration helper to sync Local cache to cloud storage (namespaced for backward compatibility)
   ========================================================================== */

export async function syncCloud(userId: string): Promise<void> {
  // Sync core encryption config if absent in cloud
  const remoteConfig = await getMasterPasswordConfig(userId);
  if (!remoteConfig) {
    const localConfig = await getMasterPasswordConfig();
    if (localConfig) {
      await saveMasterPasswordConfig(localConfig, userId);
    }
  }

  // Push local entries to cloud
  const localEntries = await getVaultEntries();
  for (const entry of localEntries) {
    try {
      await saveVaultEntry(entry, userId);
    } catch (e) {
      console.warn("Skipping item sync due to missing table/network:", e);
    }
  }

  // Push local secure notes to cloud
  const localNotes = await getSecureNotes();
  for (const note of localNotes) {
    try {
      await saveSecureNote(note, userId);
    } catch (e) {
      console.warn("Skipping notes sync due to missing table/network:", e);
    }
  }

  // Push local settings to cloud
  const localSettings = await getAppSettings();
  if (localSettings) {
    try {
      await saveAppSettings(localSettings, userId);
    } catch (e) {
      console.warn("Skipping settings sync due to missing table/network:", e);
    }
  }
}
