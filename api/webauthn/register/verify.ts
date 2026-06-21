import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { toBase64Url } from '../helpers';
import { getRegisterSession, addCredential, deleteSession } from '../utils';

const rpID = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost';
const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, attestation } = request.body;
  if (!email || !attestation) {
    response.status(400).json({ error: 'Email and attestation are required' });
    return;
  }

  const expectedChallenge = await getRegisterSession(email);
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

    await addCredential(email, {
      credentialId: toBase64Url(verification.registrationInfo.credentialID),
      publicKey: Buffer.from(verification.registrationInfo.credentialPublicKey).toString('base64'),
      counter: verification.registrationInfo.counter,
      transports: null,
      userHandle: '',
    });

    await deleteSession(email, 'registration');

    response.status(200).json({ verified: true });
  } catch (err: any) {
    console.error(err);
    response.status(400).json({ error: err.message || 'Verification failed' });
  }
}
