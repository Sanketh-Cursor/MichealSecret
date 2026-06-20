/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, getDocFromServer, doc } from 'firebase/firestore';

// Configuration loaded from provisioned credentials
const firebaseConfig = {
  apiKey: "AIzaSyAGzYgE8lb34BQsTGC2gjf_K6M5FBpNB0g",
  authDomain: "elevated-alloy-jpnh2.firebaseapp.com",
  projectId: "elevated-alloy-jpnh2",
  appId: "1:946453144717:web:64b44878ed839d197f6ec4",
  storageBucket: "elevated-alloy-jpnh2.firebasestorage.app",
  messagingSenderId: "946453144717"
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firestore on custom databaseId
const databaseId = "ai-studio-13d7754f-7a57-4722-9d29-b87341ddd4fd";
export const db = getFirestore(app, databaseId);

// Initialize Authentication
export const auth = getAuth(app);

// Google OAuth Provider configuration
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/**
 * Validates connection to firestore according to firebase-integration guidelines
 */
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase Firestore connection verified successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.error("Please check your Firebase configuration or network status.", error);
    }
  }
}

// Run connectivity check silently
testFirestoreConnection();
