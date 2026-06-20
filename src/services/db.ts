/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultEntry, SecureNote, AppSettings, MasterPasswordConfig } from '../types';
import { db } from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  collection 
} from 'firebase/firestore';

const DB_NAME = 'LocalPasswordManagerDB';
const DB_VERSION = 1;

/**
 * DATABASE STORAGE - SECURITY & HYBRID PARADIGMS
 * 
 * DESIGN DECISIONS & SECURITY STANDARDS:
 * 1. Hybrid Client-Cloud Persistence:
 *    - By default, user state is sandboxed inside local IndexedDB.
 *    - When authenticated via Google OAuth 2.0 with Firebase Auth, data securely synchronizes with Firestore.
 *    - To maintain absolute secrecy, sensitive fields (passwords, notes content) are fully encrypted in AES-256-GCM
 *      prior to syncing to Firestore. Plaintext Master Passwords are never sent across the network.
 * 2. Identity Sandboxing in Cloud:
 *    - Document boundaries are isolated under specific routes: /users/{userId}/[collections]
 *    - User A cannot view, write, or find User B's vault items due to Firestore secure rules.
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
    const docRef = doc(db, 'users', userId, 'auth_config', 'config');
    await setDoc(docRef, config);
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
      const docRef = doc(db, 'users', userId, 'auth_config', 'config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          salt: data.salt,
          verificationHash: data.verificationHash
        };
      }
      return null;
    } catch (err) {
      console.error("Firestore loading of config failed, fallback to local:", err);
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
    const docRef = doc(db, 'users', userId, 'settings', 'app_settings');
    await setDoc(docRef, settings);
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
      const docRef = doc(db, 'users', userId, 'settings', 'app_settings');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          autoLockDuration: data.autoLockDuration ?? 15,
          theme: data.theme ?? 'light'
        };
      }
    } catch (err) {
      console.error("Firestore loading of settings failed, fallback:", err);
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
      const colRef = collection(db, 'users', userId, 'vault_entries');
      const snap = await getDocs(colRef);
      const entries: VaultEntry[] = [];
      snap.forEach(doc => {
        entries.push(doc.data() as VaultEntry);
      });
      return entries;
    } catch (err) {
      console.error("Firestore loading of vault entries failed, fallback to local:", err);
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
    const docRef = doc(db, 'users', userId, 'vault_entries', entry.id);
    await setDoc(docRef, entry);
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
    const docRef = doc(db, 'users', userId, 'vault_entries', id);
    await deleteDoc(docRef);
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
      const colRef = collection(db, 'users', userId, 'secure_notes');
      const snap = await getDocs(colRef);
      const notes: SecureNote[] = [];
      snap.forEach(doc => {
        notes.push(doc.data() as SecureNote);
      });
      return notes;
    } catch (err) {
      console.error("Firestore loading of secure notes failed, fallback to local:", err);
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
    const docRef = doc(db, 'users', userId, 'secure_notes', note.id);
    await setDoc(docRef, note);
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
    const docRef = doc(db, 'users', userId, 'secure_notes', id);
    await deleteDoc(docRef);
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
  // If online, we don't automatically delete remote databases to protect user from mistakes,
  // but we reset the client-side IndexedDB Cache immediately.
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
   Migration helper to sync Local cache to Firebase Firestore cloud storage
   ========================================================================== */

export async function syncLocalToFirebase(userId: string): Promise<void> {
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
    await saveVaultEntry(entry, userId);
  }

  // Push local secure notes to cloud
  const localNotes = await getSecureNotes();
  for (const note of localNotes) {
    await saveSecureNote(note, userId);
  }

  // Push local settings to cloud
  const localSettings = await getAppSettings();
  if (localSettings) {
    await saveAppSettings(localSettings, userId);
  }
}
