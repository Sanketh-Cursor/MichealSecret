import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getAuthenticationSession, getCredentials } from '../utils';

const rpID = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost';
const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, assertion } = request.body;
  if (!email || !assertion) {
    response.status(400).json({ error: 'Email and assertion are required' });
    return;
  }

  const expectedAuth = getAuthenticationSession(email);
  if (!expectedAuth) {
    response.status(400).json({ error: 'No authentication session found' });
    return;
  }

  const credentials = getCredentials(email);
  const storedCredential = credentials.find((cred) => cred.credentialId === assertion.id);
  if (!storedCredential) {
    response.status(404).json({ error: 'Credential not registered' });
    return;
  }

  try {
    const verification = await verifyAuthenticationResponse({
      credential: assertion,
      expectedChallenge: expectedAuth.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialPublicKey: Buffer.from(storedCredential.publicKey, 'base64'),
        credentialID: storedCredential.credentialId,
        counter: storedCredential.counter,
      },
    });

    if (!verification.verified) {
      throw new Error('Authentication verification failed');
    }

    storedCredential.counter = verification.authenticationInfo.newCounter;
    response.status(200).json({ verified: true });
  } catch (err: any) {
    console.error(err);
    response.status(400).json({ error: err.message || 'Verification failed' });
  }
}
