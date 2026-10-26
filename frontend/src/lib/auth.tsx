"use client";

// Session = who is signed in + their live profile document. Two backends behind one hook:
//   • Firebase mode (production): Firebase Auth (Google / anonymous guest) + users/{uid} in Firestore.
//     Guests can upgrade in place: linkWithGoogle() keeps the same uid, points and posts.
//   • Demo mode (no NEXT_PUBLIC_FIREBASE_* set): lib/data/local.ts, clearly labelled in the UI.
// Pages only ever call useSession(); they never touch Firebase Auth directly.

import { GoogleAuthProvider, getRedirectResult, linkWithPopup, onAuthStateChanged, signInWithCredential } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { errorMessage } from "./async";
import { localSession } from "./data/local";
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
import { avatarColorFor, initialsOf, slugify } from "./format";
import type { User } from "./types";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export type LinkResult = "linked" | "switched";

export type Session = {
  mode: "firebase" | "demo";
  status: SessionStatus;
  user: User | null;
  /** Set when sign-in succeeded but the profile could not be loaded/created (rules, offline). */
  error: string | null;
  /** Demo mode only: seeded profiles for the login grid. */
  demoUsers: User[];
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  /** Demo mode only: pick a seeded profile or type a name. */
  signInDemo: (opts: { userId?: string; name?: string }) => Promise<User>;
  /**
   * Upgrade the current guest to a Google account, keeping uid/points/posts ("linked").
   * If that Google account already has an EcoLoop profile we sign into it instead ("switched").
   */
  linkWithGoogle: () => Promise<LinkResult>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<Omit<User, "id">>) => Promise<void>;
  retry: () => void;
  resetDemo: () => void;
};

const SessionContext = createContext<Session | null>(null);

/** Thrown by sign-in helpers when the user closed the popup — callers should stay quiet. */
export class SignInCancelled extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "SignInCancelled";
  }
}

const isCancelled = (err: unknown) => AUTH_CANCELLED_CODES.has((err as { code?: string }).code ?? "");

export function SessionProvider({ children }: { children: ReactNode }) {
  return isFirebaseConfigured ? <FirebaseSession>{children}</FirebaseSession> : <DemoSession>{children}</DemoSession>;
}

// ---- Firebase mode ----------------------------------------------------------------------------

function FirebaseSession({ children }: { children: ReactNode }) {
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
      if (!isCancelled(err)) setError(authErrorMessage(err));
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

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await fbSignInWithGoogle();
    } catch (err) {
      if (isCancelled(err)) throw new SignInCancelled();
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

  const linkWithGoogle = useCallback(async (): Promise<LinkResult> => {
    const auth = getFirebaseAuth();
    const current = auth?.currentUser;
    if (!auth || !current) throw new Error("Sign in first");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const cred = await linkWithPopup(current, provider);
      // Same uid, now permanent. Refresh the public profile with the Google identity.
      const g = cred.user;
      await g.getIdToken(true); // rules check sign_in_provider; make sure the next write carries the Google token
      const name = g.displayName?.trim() || user?.name || "Neighbour";
      const base = slugify(name) || "neighbour";
      await patchUserDoc(g.uid, {
        isGuest: false,
        name,
        handle: `${base}${g.uid.slice(0, 4).toLowerCase()}`,
        initials: initialsOf(name),
        avatarColor: avatarColorFor(g.uid),
        photoURL: g.photoURL || undefined,
      });
      return "linked";
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (isCancelled(err)) throw new SignInCancelled();
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        // This Google account already owns an EcoLoop profile: switch to it (guest points stay behind).
        const credential = GoogleAuthProvider.credentialFromError(err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
        if (!credential) throw new Error("That Google account is already in use. Sign out and sign in with Google instead.");
        await signInWithCredential(auth, credential);
        return "switched";
      }
      throw new Error(authErrorMessage(err));
    }
  }, [user?.name]);

  const signOut = useCallback(async () => {
    await signOutUser();
  }, []);

  const updateUser = useCallback(async (patch: Partial<Omit<User, "id">>) => {
    const uid = uidRef.current;
    if (!uid) throw new Error("Sign in first");
    setUser((u) => (u ? { ...u, ...patch } : u)); // optimistic; the snapshot confirms
    await patchUserDoc(uid, patch);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const resetDemo = useCallback(() => undefined, []);

  const value = useMemo<Session>(
    () => ({
      mode: "firebase",
      status,
      user,
      error,
      demoUsers: [],
      signInWithGoogle,
      signInAsGuest,
      signInDemo,
      linkWithGoogle,
      signOut,
      updateUser,
      retry,
      resetDemo,
    }),
    [status, user, error, signInWithGoogle, signInAsGuest, signInDemo, linkWithGoogle, signOut, updateUser, retry, resetDemo],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ---- Demo mode (no Firebase config) -----------------------------------------------------------

function DemoSession({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<{ hydrated: boolean; user: User | null; demoUsers: User[] }>({ hydrated: false, user: null, demoUsers: [] });

  useEffect(() => localSession.subscribe((user, demoUsers) => setSnap({ hydrated: true, user, demoUsers })), []);

  const status: SessionStatus = !snap.hydrated ? "loading" : snap.user ? "signed-in" : "signed-out";

  const signInWithGoogle = useCallback(async () => {
    throw new Error("Google sign-in needs Firebase. Set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local, or continue as guest.");
  }, []);
  const signInAsGuest = useCallback(async () => {
    localSession.login({ name: guestName() });
  }, []);
  const signInDemo = useCallback(async (opts: { userId?: string; name?: string }) => localSession.login(opts), []);
  const linkWithGoogle = useCallback(async (): Promise<LinkResult> => {
    throw new Error("Google sign-in needs Firebase (demo mode).");
  }, []);
  const signOut = useCallback(async () => localSession.logout(), []);
  const updateUser = useCallback(async (patch: Partial<Omit<User, "id">>) => localSession.patchUser(patch), []);
  const retry = useCallback(() => undefined, []);
  const resetDemo = useCallback(() => localSession.reset(), []);

  const value = useMemo<Session>(
    () => ({
      mode: "demo",
      status,
      user: snap.user,
      error: null,
      demoUsers: snap.demoUsers,
      signInWithGoogle,
      signInAsGuest,
      signInDemo,
      linkWithGoogle,
      signOut,
      updateUser,
      retry,
      resetDemo,
    }),
    [status, snap.user, snap.demoUsers, signInWithGoogle, signInAsGuest, signInDemo, linkWithGoogle, signOut, updateUser, retry, resetDemo],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
