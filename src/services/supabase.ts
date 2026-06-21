/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

// Load Supabase environment variables
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase Client with fallbacks to avoid compilation and loader crashes if not defined
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://placeholder-project.supabase.co'
);

/**
 * Validates connection to Supabase according to guidelines
 */
export async function testSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured) {
    console.warn("Supabase is not configured yet. Working in local sandbox mode.");
    return false;
  }
  try {
    const { error } = await supabase.from('vault_entries').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.warn("Supabase check error (this is normal if tables are not created yet):", error.message);
    } else {
      console.log("Supabase connection verified successfully.");
    }
    return true;
  } catch (error) {
    console.error("Supabase connection failed:", error);
    return false;
  }
}

// Run connectivity check silently
testSupabaseConnection();

/* ==========================================================================
   Auth Helpers
   - sendPasswordResetEmail: requests a password reset email via Supabase Auth
   - isPasskeySupported: lightweight feature-detect for WebAuthn / passkeys
   - startPasskeyFlow: placeholder to be implemented when server-side WebAuthn support exists
   ========================================================================== */

export async function sendPasswordResetEmail(email: string, redirectTo?: string) {
  if (!email) throw new Error('Email is required');
  try {
    // supabase-js v2 provides resetPasswordForEmail
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('sendPasswordResetEmail failed:', err);
    throw err;
  }
}

export function isPasskeySupported(): boolean {
  try {
    return typeof window !== 'undefined' && !!(window.PublicKeyCredential && navigator.credentials);
  } catch (e) {
    return false;
  }
}

export async function startPasskeyFlow(): Promise<never> {
  // Full WebAuthn / passkey flows require server-side endpoints to produce
  // challenge/credential options and to verify assertions. Implementing
  // end-to-end passkeys requires backend support (Supabase's GoTrue needs
  // specific endpoints or using a proxy). This placeholder intentionally
  // throws so callers know the feature isn't wired yet.
  throw new Error('Passkey flow not implemented. Implement server-side WebAuthn endpoints and wire this helper.');
}

// --- WebAuthn helpers (client-side) -------------------------------------------------
function b64ToArrayBuffer(base64url: string) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

function arrayBufferToB64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = window.btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const PASSKEY_API_BASE = (import.meta as any).env.VITE_PASSKEY_API_URL || (typeof window !== 'undefined' ? window.location.origin + '/api/webauthn' : '/api/webauthn');

export async function startPasskeyRegistration(email: string) {
  if (!email) throw new Error('Email required for passkey registration');
  if (typeof window === 'undefined' || !window.PublicKeyCredential) throw new Error('WebAuthn not supported in this environment');

  // 1) Request registration options from server
  const optsRes = await fetch(`${PASSKEY_API_BASE}/register/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!optsRes.ok) throw new Error('Failed to get registration options');
  const optsJson = await optsRes.json();

  // Convert challenge and user.id to ArrayBuffers
  optsJson.publicKey.challenge = b64ToArrayBuffer(optsJson.publicKey.challenge);
  optsJson.publicKey.user.id = b64ToArrayBuffer(optsJson.publicKey.user.id);
  if (optsJson.publicKey.excludeCredentials) {
    optsJson.publicKey.excludeCredentials = optsJson.publicKey.excludeCredentials.map((c: any) => ({
      ...c,
      id: b64ToArrayBuffer(c.id)
    }));
  }

  // 2) Create credential
  const credential: any = await navigator.credentials.create({ publicKey: optsJson.publicKey });
  if (!credential) throw new Error('Credential creation was not completed');

  // 3) Send attestation to server for verification
  const attestation = {
    id: credential.id,
    rawId: arrayBufferToB64(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToB64(credential.response.clientDataJSON),
      attestationObject: arrayBufferToB64((credential.response as any).attestationObject)
    }
  };

  const verifyRes = await fetch(`${PASSKEY_API_BASE}/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, attestation })
  });
  if (!verifyRes.ok) throw new Error('Passkey registration verification failed');
  return await verifyRes.json();
}

export async function startPasskeySignIn(email: string) {
  if (!email) throw new Error('Email required for passkey sign-in');
  if (typeof window === 'undefined' || !window.PublicKeyCredential) throw new Error('WebAuthn not supported in this environment');

  // 1) Get assertion options from server
  const optsRes = await fetch(`${PASSKEY_API_BASE}/authenticate/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!optsRes.ok) throw new Error('Failed to get assertion options');
  const optsJson = await optsRes.json();

  optsJson.publicKey.challenge = b64ToArrayBuffer(optsJson.publicKey.challenge);
  if (optsJson.publicKey.allowCredentials) {
    optsJson.publicKey.allowCredentials = optsJson.publicKey.allowCredentials.map((c: any) => ({
      ...c,
      id: b64ToArrayBuffer(c.id)
    }));
  }

  // 2) Get assertion from authenticator
  const assertion: any = await navigator.credentials.get({ publicKey: optsJson.publicKey });
  if (!assertion) throw new Error('Assertion was not obtained');

  const assertionPayload = {
    id: assertion.id,
    rawId: arrayBufferToB64(assertion.rawId),
    type: assertion.type,
    response: {
      clientDataJSON: arrayBufferToB64(assertion.response.clientDataJSON),
      authenticatorData: arrayBufferToB64(assertion.response.authenticatorData),
      signature: arrayBufferToB64(assertion.response.signature),
      userHandle: assertion.response.userHandle ? arrayBufferToB64(assertion.response.userHandle) : null
    }
  };

  // 3) Verify assertion with server
  const verifyRes = await fetch(`${PASSKEY_API_BASE}/authenticate/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, assertion: assertionPayload })
  });
  if (!verifyRes.ok) throw new Error('Passkey authentication failed');
  return await verifyRes.json();
}
