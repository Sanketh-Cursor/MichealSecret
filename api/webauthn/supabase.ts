import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and key are required for passkey API routes. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface PasskeySessionRecord {
  email: string;
  challenge: string;
  type: 'registration' | 'authentication';
  created_at?: string;
}

export interface StoredCredentialRecord {
  id: string;
  email: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  user_handle: string | null;
  created_at?: string;
}

export async function savePasskeySession(email: string, challenge: string, type: 'registration' | 'authentication') {
  const { error } = await supabase.from('webauthn_sessions').upsert({
    email,
    challenge,
    type,
  }, { onConflict: ['email', 'type'] });
  if (error) throw error;
}

export async function getPasskeySession(email: string, type: 'registration' | 'authentication'): Promise<PasskeySessionRecord | null> {
  const { data, error } = await supabase.from('webauthn_sessions').select('email,challenge,type').eq('email', email).eq('type', type).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function deletePasskeySession(email: string, type: 'registration' | 'authentication') {
  const { error } = await supabase.from('webauthn_sessions').delete().eq('email', email).eq('type', type);
  if (error) throw error;
}

export async function addPasskeyCredential(email: string, credential: Omit<StoredCredentialRecord, 'id' | 'created_at'>) {
  const { error } = await supabase.from('webauthn_credentials').upsert({
    email,
    credential_id: credential.credential_id,
    public_key: credential.public_key,
    counter: credential.counter,
    transports: credential.transports,
    user_handle: credential.user_handle,
  }, { onConflict: ['email', 'credential_id'] });
  if (error) throw error;
}

export async function getPasskeyCredentials(email: string): Promise<StoredCredentialRecord[]> {
  const { data, error } = await supabase.from('webauthn_credentials').select('credential_id,public_key,counter,transports,user_handle').eq('email', email);
  if (error) throw error;
  return data || [];
}
