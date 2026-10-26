"use client";

// Session = who is signed in + their profile document. Two backends behind one hook:
//   • Firebase mode (production): Firebase Auth (Google / anonymous guest) + users/{uid} in Firestore.
//   • Demo mode (no NEXT_PUBLIC_FIREBASE_* set): the localStorage store, clearly labelled in the UI.
// Pages only ever call useSession(); they never touch Firebase directly.

import { onAuthStateChanged, getRedirectResult } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { errorMessage } from "./async";
import { ensureUserDoc, guestName, patchUserDoc, subscribeUser } from "./db/users";
import {
  AUTH_CANCELLED_CODES,
  authErrorMessage,
  getFirebaseAuth,
  isFirebaseConfigured,
  signInAsGuest as fbSignInAsGuest,
  signInWithGoogle as fbSignInWithGoogle,
  signOutUser,
} from "./firebase.client";
import { useStore } from "./store";
import type { User } from "./types";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export type Session = {
  mode: "firebase" | "demo";
  status: SessionStatus;
  user: User | null;
  /** Set when sign-in succeeded but the profile could not be loaded/created (rules, offline). */
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  /** Demo mode only: pick a seeded profile or type a name. */
  signInDemo: (opts: { userId?: string; name?: string }) => Promise<User>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<Omit<User, "id">>) => Promise<void>;
  retry: () => void;
};

const SessionContext = createContext<Session | null>(null);

/** Thrown by sign-in helpers when the user closed the popup — callers should stay quiet. */
export class SignInCancelled extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "SignInCancelled";
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return isFirebaseConfigured ? <FirebaseSession>{children}</FirebaseSession> : <DemoSession>{children}</DemoSession>;
}

// ---- Firebase mode ----------------------------------------------------------------------------

function FirebaseSession({ children }: { children: ReactNode }) {
  const store = useStore();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    let unsubUser: (() => void) | null = null;
    let cancelled = false;

    // Surface redirect-flow failures (popup fallback) instead of silently landing on /login.
    getRedirectResult(auth).catch((err) => {
      if (!AUTH_CANCELLED_CODES.has((err as { code?: string }).code ?? "")) setError(authErrorMessage(err));
    });

    const unsubAuth = onAuthStateChanged(auth, async (fb) => {
      unsubUser?.();
      unsubUser = null;
      if (!fb) {
        uidRef.current = null;
        setUser(null);
        setError(null);
        setStatus("signed-out");
        return;
      }
      uidRef.current = fb.uid;
      setStatus("loading");
      try {
        const first = await ensureUserDoc(fb);
        if (cancelled || uidRef.current !== fb.uid) return;
        setUser(first);
        setError(null);
        setStatus("signed-in");
        unsubUser = subscribeUser(
          fb.uid,
          (u) => {
            if (u) setUser(u);
          },
          (err) => setError(errorMessage(err, "Lost connection to your profile.")),
        );
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
        setStatus("signed-in"); // signed in, but no profile — AppShell shows a retry screen
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      unsubUser?.();
    };
  }, [attempt]);

  // Transitional bridge (removed in Phase 2 when the marketplace moves to Firestore): mirror the
  // Firestore profile into the local store so pages that still read useStore().currentUser work.
  const { adoptUser, logout: storeLogout } = store;
  useEffect(() => {
    if (status === "signed-in" && user) adoptUser(user);
    else if (status === "signed-out") storeLogout();
  }, [status, user, adoptUser, storeLogout]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await fbSignInWithGoogle();
    } catch (err) {
      if (AUTH_CANCELLED_CODES.has((err as { code?: string }).code ?? "")) throw new SignInCancelled();
      throw new Error(authErrorMessage(err));
    }
  }, []);

  const signInAsGuest = useCallback(async () => {
    setError(null);
    try {
      await fbSignInAsGuest();
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  }, []);

  const signInDemo = useCallback(async (): Promise<User> => {
    throw new Error("Demo profiles are only available when Firebase is not configured.");
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
  }, []);

  const updateUser = useCallback(
    async (patch: Partial<Omit<User, "id">>) => {
      const uid = uidRef.current;
      if (!uid) throw new Error("Sign in first");
      setUser((u) => (u ? { ...u, ...patch } : u)); // optimistic; the snapshot confirms
      await patchUserDoc(uid, patch);
    },
    [],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<Session>(
    () => ({ mode: "firebase", status, user, error, signInWithGoogle, signInAsGuest, signInDemo, signOut, updateUser, retry }),
    [status, user, error, signInWithGoogle, signInAsGuest, signInDemo, signOut, updateUser, retry],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ---- Demo mode (no Firebase config) -----------------------------------------------------------

function DemoSession({ children }: { children: ReactNode }) {
  const store = useStore();
  const { hydrated, currentUser, login, logout, patchUser } = store;

  const status: SessionStatus = !hydrated ? "loading" : currentUser ? "signed-in" : "signed-out";

  const signInWithGoogle = useCallback(async () => {
    throw new Error("Google sign-in needs Firebase. Set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local, or continue as guest.");
  }, []);
  const signInAsGuest = useCallback(async () => {
    login({ name: guestName() });
  }, [login]);
  const signInDemo = useCallback(async (opts: { userId?: string; name?: string }) => login(opts), [login]);
  const signOut = useCallback(async () => logout(), [logout]);
  const updateUser = useCallback(async (patch: Partial<Omit<User, "id">>) => patchUser(patch), [patchUser]);
  const retry = useCallback(() => undefined, []);

  const value = useMemo<Session>(
    () => ({ mode: "demo", status, user: currentUser, error: null, signInWithGoogle, signInAsGuest, signInDemo, signOut, updateUser, retry }),
    [status, currentUser, signInWithGoogle, signInAsGuest, signInDemo, signOut, updateUser, retry],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
