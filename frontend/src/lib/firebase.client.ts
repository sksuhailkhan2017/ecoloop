// Firebase client SDK (Auth + Firestore), initialised lazily. When NEXT_PUBLIC_FIREBASE_* are not
// set the app runs in a clearly-labelled demo mode and nothing here is ever initialised, so
// importing this module never throws. All env values are read from process.env — never hardcoded.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type UserCredential,
} from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

/** True in production. False = demo mode (local dev without a Firebase project). */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

/** Auth instance, or null in demo mode. */
export function getFirebaseAuth(): Auth | null {
  const a = getFirebaseApp();
  if (!a) return null;
  if (!authInstance) authInstance = getAuth(a);
  return authInstance;
}

/** Firestore instance, or null in demo mode. `undefined` fields are dropped instead of throwing. */
export function getDb(): Firestore | null {
  const a = getFirebaseApp();
  if (!a) return null;
  if (!dbInstance) {
    try {
      dbInstance = initializeFirestore(a, { ignoreUndefinedProperties: true });
    } catch {
      dbInstance = getFirestore(a); // already initialised (hot reload)
    }
  }
  return dbInstance;
}

function requireAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured — set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local");
  return auth;
}

/** Error codes that mean "the user changed their mind", not a failure worth showing. */
export const AUTH_CANCELLED_CODES = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

/**
 * Google sign-in. Popup first (works on desktop and most mobile browsers); if the browser blocks
 * popups (in-app browsers, strict iOS settings) fall back to a full-page redirect.
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  const auth = requireAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      return null; // page navigates away; onAuthStateChanged picks it up when we come back
    }
    throw err;
  }
}

export const signInAsGuest = () => signInAnonymously(requireAuth());
export const signOutUser = () => signOut(requireAuth());

/** Friendly copy for the auth errors a user can actually do something about. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  switch (code) {
    case "auth/configuration-not-found":
      return "Firebase Authentication isn't set up for this project yet (Firebase console → Authentication → Get started, then enable Google and Anonymous).";
    case "auth/unauthorized-domain":
      return "This site isn't authorised for Google sign-in yet (Firebase console → Authentication → Settings → Authorized domains).";
    case "auth/operation-not-allowed":
      return "This sign-in method isn't enabled in Firebase yet (Authentication → Sign-in method).";
    case "auth/network-request-failed":
      return "No connection. Check your network and try again.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window. Allow pop-ups for this site, or try again.";
    case "auth/admin-restricted-operation":
      return "Guest sign-in isn't enabled in Firebase yet (Authentication → Sign-in method → Anonymous).";
    default:
      return err instanceof Error && err.message ? err.message.replace(/^Firebase:\s*/, "") : "Sign-in failed. Please try again.";
  }
}
