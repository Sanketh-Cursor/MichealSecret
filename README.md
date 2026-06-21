<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/13d7754f-7a57-4722-9d29-b87341ddd4fd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Passkey Testing

1. Make sure your app is running on a secure origin (`http://localhost` or `https://`).
2. Configure your Vercel environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (your deployed app URL)
3. Use email/password sign-in or sign-up inside the app.
4. After logging in, click `Register Passkey` to create a passkey credential.
5. Sign out, then return to the login screen and click `Sign in with Passkey`.
6. Complete the browser authenticator prompt to verify the passkey login.

> Note: Passkey support requires the backend WebAuthn routes under `api/webauthn/*` to be deployed and working.

## Maintained By

Maintained by the KeyKeeper project owner and updated to support Supabase authentication, password reset, and passkeys.



