import { getPasskeySession, savePasskeySession, deletePasskeySession, addPasskeyCredential, getPasskeyCredentials, updatePasskeyCredentialCounter } from './supabase';

export interface StoredCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  userHandle: string;
}

export async function saveRegisterSession(email: string, value: any) {
  await savePasskeySession(email, value.challenge, 'registration');
}

export async function getRegisterSession(email: string) {
  const session = await getPasskeySession(email, 'registration');
  return session;
}

export async function saveAuthenticationSession(email: string, value: any) {
  await savePasskeySession(email, value.challenge, 'authentication');
}

export async function getAuthenticationSession(email: string) {
  const session = await getPasskeySession(email, 'authentication');
  return session;
}

export async function addCredential(email: string, credential: StoredCredential) {
  await addPasskeyCredential(email, {
    credential_id: credential.credentialId,
    public_key: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ? credential.transports.join(',') : null,
    user_handle: credential.userHandle || null,
  });
}

export async function updateCredentialCounter(email: string, credentialId: string, counter: number) {
  await updatePasskeyCredentialCounter(email, credentialId, counter);
}

export async function getCredentials(email: string): Promise<StoredCredential[]> {
  const rows = await getPasskeyCredentials(email);
  return rows.map((row) => ({
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports ? row.transports.split(',') : undefined,
    userHandle: row.user_handle || '',
  }));
}

export async function deleteSession(email: string, type: 'registration' | 'authentication') {
  await deletePasskeySession(email, type);
}

export async function clearSession(email: string) {
  await deletePasskeySession(email, 'registration');
  await deletePasskeySession(email, 'authentication');
}
