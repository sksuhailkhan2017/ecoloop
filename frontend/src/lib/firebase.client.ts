// Firebase *client* SDK — auth only, initialised lazily. In demo mode (no NEXT_PUBLIC_FIREBASE_*
// vars, e.g. on Netlify today) nothing is initialised, so importing this module never throws.
// All Firestore/Storage writes go through the backend API.
import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInAnonymously, signInWithPopup, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let authInstance: Auth | null = null;

/** Returns the Auth instance, or null when Firebase isn't configured (demo mode). */
export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured) return null;
  if (!authInstance) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  }
  return authInstance;
}

function requireAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured — set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local");
  return auth;
}

export const signInWithGoogle = () => signInWithPopup(requireAuth(), new GoogleAuthProvider());
export const signInAsGuest = () => signInAnonymously(requireAuth());

export const DEFAULT_LOCATION = {
  lat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? 43.8561),
  lng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? -79.337),
};
