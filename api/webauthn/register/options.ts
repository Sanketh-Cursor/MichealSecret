import { generateRegistrationOptions } from '@simplewebauthn/server';
import { toBase64Url } from '../helpers';
import { saveRegisterSession } from '../utils';

const rpName = 'KeyKeeper';
const rpID = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost';
const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email } = request.body;
  if (!email) {
    response.status(400).json({ error: 'Email is required' });
    return;
  }

  const userId = toBase64Url(Buffer.from(email, 'utf8'));
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

  await saveRegisterSession(email, registrationOptions);
  response.status(200).json({ publicKey: registrationOptions });
}
