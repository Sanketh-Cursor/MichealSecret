/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VaultEntry {
  id: string; // UUID or dynamic unique string
  title: string;
  url: string;
  username: string;
  email: string;
  encryptedPassword: EncryptedData;
  encryptedNotes: EncryptedData;
  createdAt: number;
  updatedAt: number;
}

export interface SecureNote {
  id: string;
  title: string;
  encryptedContent: EncryptedData;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  autoLockDuration: number; // in minutes (0 means never)
  theme: 'light' | 'dark';
}

export interface AuthState {
  isSetup: boolean; // Has a master password been set up?
  isUnlocked: boolean; // Is the vault currently unlocked?
  masterKey: CryptoKey | null; // Raw derived symmetric key used to encrypt/decrypt
  lastActive: number; // For session timeout check
}

export interface EncryptedData {
  ciphertext: string; // Hex or Base64 encoded encrypted string
  iv: string; // Initialization vector in Hex or Base64
}

export interface MasterPasswordConfig {
  salt: string; // Hex string of secure random salt
  verificationHash: string; // Hash of master password + salt for checking verification
}
