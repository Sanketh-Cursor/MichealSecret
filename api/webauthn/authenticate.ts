import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getCredentials, saveAuthenticationSession } from './utils';
import { base64url } from '@simplewebauthn/server/helpers';

const rpID = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost';
const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email } = request.body;
  if (!email) {
    response.status(400).json({ error: 'Email is required' });
    return;
  }

  const credentials = getCredentials(email);
  if (credentials.length === 0) {
    response.status(404).json({ error: 'No passkeys registered for this email' });
    return;
  }

  const allowCredentials = credentials.map((cred) => ({
    id: base64url.toBase64url(cred.credentialId),
    type: 'public-key',
  }));

  const options = generateAuthenticationOptions({
    timeout: 60000,
    allowCredentials,
    userVerification: 'preferred',
    rpID,
  });

  saveAuthenticationSession(email, options);
  response.status(200).json({ publicKey: options });
}
