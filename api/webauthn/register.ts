import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { base64url } from '@simplewebauthn/server/helpers';
import { getChallenge, saveRegisterSession, addCredential } from './utils';

const rpName = 'KeyKeeper';
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

  const userId = base64url(Buffer.from(email, 'utf8'));
  const registrationOptions = generateRegistrationOptions({
    rpName,
    rpID,
    userID: userId,
    userName: email,
    timeout: 60000,
    attestationType: 'indirect',
    authenticatorSelection: {
      userVerification: 'preferred',
      residentKey: 'discouraged',
    },
    excludeCredentials: [],
  });

  saveRegisterSession(email, registrationOptions);
  response.status(200).json({ publicKey: registrationOptions });
}
