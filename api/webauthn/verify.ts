import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { base64url } from '@simplewebauthn/server/helpers';
import { getRegisterSession, addCredential } from './utils';

const rpName = 'KeyKeeper';
const rpID = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost';
const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, attestation } = request.body;
  if (!email || !attestation) {
    response.status(400).json({ error: 'Email and attestation are required' });
    return;
  }

  const expectedChallenge = getRegisterSession(email);
  if (!expectedChallenge) {
    response.status(400).json({ error: 'No registration session found' });
    return;
  }

  try {
    const verification = await verifyRegistrationResponse({
      credential: attestation,
      expectedChallenge: expectedChallenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified) {
      throw new Error('Registration verification failed');
    }

    addCredential(email, {
      credentialId: verification.registrationInfo.credentialID,
      publicKey: verification.registrationInfo.credentialPublicKey,
      counter: verification.registrationInfo.counter,
      transports: verification.registrationInfo.transports,
      userHandle: verification.registrationInfo.userHandle?.toString('base64url') || '',
    });

    response.status(200).json({ verified: true });
  } catch (err: any) {
    console.error(err);
    response.status(400).json({ error: err.message || 'Verification failed' });
  }
}
