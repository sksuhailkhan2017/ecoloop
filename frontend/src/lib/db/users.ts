// users/{uid} in Firestore: create on first sign-in, live-subscribe, patch.
import type { User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot, runTransaction, updateDoc, type DocumentData } from "firebase/firestore";

import { withTimeout } from "../async";
import { getDb } from "../firebase.client";
import { avatarColorFor, initialsOf, nowIso, slugify } from "../format";
import { DEFAULT_LOCATION, nearestNeighbourhood } from "../geo";
import type { User } from "../types";

const WRITE_TIMEOUT_MS = 10_000;

function db() {
  const d = getDb();
  if (!d) throw new Error("Firestore is not configured");
  return d;
}

export const userRef = (uid: string) => doc(db(), "users", uid);

/** "Neighbour 4821" — guests get a friendly, non-identifying name. */
export function guestName(): string {
  return `Neighbour ${1000 + Math.floor(Math.random() * 9000)}`;
}

/** The user document written on first sign-in. Points and streak start at zero (enforced by rules). */
export function newUserDoc(fb: FirebaseUser): Omit<User, "id"> {
  const isGuest = fb.isAnonymous;
  const name = (!isGuest && fb.displayName?.trim()) || guestName();
  const base = slugify(name) || "neighbour";
  return {
    name,
    handle: isGuest ? base : `${base}${fb.uid.slice(0, 4).toLowerCase()}`,
    initials: initialsOf(name),
    avatarColor: avatarColorFor(fb.uid),
    photoURL: (!isGuest && fb.photoURL) || undefined,
    neighbourhood: nearestNeighbourhood(DEFAULT_LOCATION),
    points: 0,
    streakCount: 0,
    location: DEFAULT_LOCATION,
    joinedAt: nowIso(),
    isGuest,
  };
}

/** Firestore docs never carry `id`; it is the document key. */
export function toUser(uid: string, data: DocumentData): User {
  return { ...(data as Omit<User, "id">), id: uid };
}

/** Creates users/{uid} if it does not exist yet; returns the current doc either way. */
export async function ensureUserDoc(fb: FirebaseUser): Promise<User> {
  const ref = userRef(fb.uid);
  return withTimeout(
    runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return toUser(fb.uid, snap.data());
      const data = newUserDoc(fb);
      tx.set(ref, data);
      return { ...data, id: fb.uid };
    }),
    WRITE_TIMEOUT_MS,
    "Couldn't reach the database to set up your profile.",
  );
}

/** Live subscription to users/{uid}. `onError` fires for permission/network failures. */
export function subscribeUser(uid: string, onChange: (user: User | null) => void, onError: (err: Error) => void): () => void {
  return onSnapshot(
    userRef(uid),
    (snap) => onChange(snap.exists() ? toUser(uid, snap.data()) : null),
    (err) => onError(err),
  );
}

export async function patchUserDoc(uid: string, patch: Partial<Omit<User, "id">>): Promise<void> {
  await withTimeout(updateDoc(userRef(uid), patch), WRITE_TIMEOUT_MS, "Couldn't save your profile. Check your connection.");
}
