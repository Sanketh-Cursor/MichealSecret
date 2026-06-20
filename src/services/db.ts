/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultEntry, SecureNote, AppSettings, MasterPasswordConfig } from '../types';

const DB_NAME = 'LocalPasswordManagerDB';
const DB_VERSION = 1;

/**
 * DATABASE STORAGE - SECURITY ANALYSIS
 * 
 * DESIGN DECISIONS & SECURITY STANDARDS:
 * 1. Client-Side sandboxed storage:
 *    - Data is stored in the browser's IndexedDB, which is tied to the Origin (domain/port) under the Same-Origin Policy.
 *    - Sandboxing prevents other websites or apps from reading or writing to this database.
 * 2. Fully Encrypted Credentials/Notes:
 *    - Sensitive fields (passwords, notes content, descriptions) are stored as ciphertexts encrypted with AES-256-GCM.
 *    - Titles, URLs, usernames, emails, and metadata (like timestamps) are stored in plaintext to allow localized, indexed,
 *      super-fast client-side searching and sorting without having to decrypt every single entry in the memory array.
 * 3. Offline-First:
 *    - Zero network calls. No telemetry. No servers. The databases are established and initialized locally, matching SQLite paradigms.
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

export async function saveMasterPasswordConfig(config: MasterPasswordConfig): Promise<void> {
  const { store } = await getStore('auth_config', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({ id: 'config', ...config });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMasterPasswordConfig(): Promise<MasterPasswordConfig | null> {
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

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const { store } = await getStore('settings', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({ id: 'app_settings', ...settings });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const { store } = await getStore('settings', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get('app_settings');
      request.onsuccess = () => {
        const defaultSettings: AppSettings = {
          autoLockDuration: 15, // 15 minutes by default
          theme: 'light',
        };
        resolve(request.result ? { autoLockDuration: request.result.autoLockDuration, theme: request.result.theme } : defaultSettings);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return {
      autoLockDuration: 15,
      theme: 'light',
    };
  }
}

/* ==========================================================================
   VaultEntries / Credentials CRUD
   ========================================================================== */

export async function getVaultEntries(): Promise<VaultEntry[]> {
  const { store } = await getStore('vault_entries', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVaultEntry(entry: VaultEntry): Promise<void> {
  const { store } = await getStore('vault_entries', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteVaultEntry(id: string): Promise<void> {
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

export async function getSecureNotes(): Promise<SecureNote[]> {
  const { store } = await getStore('secure_notes', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSecureNote(note: SecureNote): Promise<void> {
  const { store } = await getStore('secure_notes', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(note);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSecureNote(id: string): Promise<void> {
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

export async function clearAllVaultData(): Promise<void> {
  const db = await openDatabase();
  const stores = ['auth_config', 'vault_entries', 'secure_notes', 'settings'];
  const transaction = db.transaction(stores, 'readwrite');
  
  stores.forEach(storeName => {
    transaction.objectStore(storeName).clear();
  });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
