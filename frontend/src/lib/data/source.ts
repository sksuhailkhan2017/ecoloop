// The data layer contract. Two implementations:
//   • lib/data/firestore.ts — production (Firebase Auth + Firestore, photos on Cloudinary)
//   • lib/data/local.ts     — demo mode (no Firebase config): localStorage, clearly labelled in the UI
// Pages never import either directly; they use the hooks in lib/data/hooks.tsx.

import type { Category, Claim, Condition, LogEntry, Post, Redemption, ScanItem, User } from "../types";

export type Unsub = () => void;
export type OnError = (err: Error) => void;

export type NewPostInput = {
  title: string;
  description: string;
  category: Category;
  condition: Condition;
  /** Cloudinary secure_url in production, data URL in demo mode, "" for no photo. */
  photoURL: string;
  fromScanId?: string;
};

export type CreatePostResult = { post: Post; delta: number; streakCount: number; bonus: boolean; capped?: boolean };
export type PickupResult = { ownerDelta: number; claimerDelta: number; limited?: string };
export type LogResult = { delta: number; streakCount: number; bonus: boolean; count: number; capped: boolean };

export interface DataSource {
  mode: "firestore" | "local";

  // ---- live reads (callback fires with the current value, then on every change) ----
  /** Open posts (newest 100) plus recently given-away posts, unsorted — the feed sorts by distance. */
  subscribeFeed(cb: (posts: Post[]) => void, onError: OnError): Unsub;
  subscribePost(id: string, cb: (post: Post | null) => void, onError: OnError): Unsub;
  /** Owner sees every claim; anyone else only their own (mirrors firestore.rules). */
  subscribeClaims(postId: string, viewer: { uid: string; isOwner: boolean }, cb: (claims: Claim[]) => void, onError: OnError): Unsub;
  subscribeMyPosts(uid: string, cb: (posts: Post[]) => void, onError: OnError): Unsub;
  /** Posts I claimed that were handed to me. */
  subscribeReceivedPosts(uid: string, cb: (posts: Post[]) => void, onError: OnError): Unsub;
  subscribeMyLogs(uid: string, cb: (logs: LogEntry[]) => void, onError: OnError): Unsub;
  subscribeMyRedemptions(uid: string, cb: (items: Redemption[]) => void, onError: OnError): Unsub;
  /** Cached one-shot profile read (names/avatars on cards). */
  getUser(id: string): Promise<User | null>;

  // ---- writes (reject with a human-readable Error; every call has a timeout) ----
  createPost(me: User, input: NewPostInput): Promise<CreatePostResult>;
  claimPost(me: User, post: Post): Promise<void>;
  confirmPickup(me: User, post: Post, claimerId: string, photoURL: string): Promise<PickupResult>;
  /**
   * Receiver side of a handover: credits pickup_receiver points once per post (idempotent).
   * Returns true when points were credited by this call.
   */
  creditReceivedPickup(me: User, post: Post): Promise<boolean>;
  logItems(me: User, items: ScanItem[], scanId?: string): Promise<LogResult>;
  redeem(me: User, rewardId: string): Promise<{ code: string }>;
}

/** Ledger doc id for the receiver's credit — deterministic so it can only be created once. */
export const receiverLedgerId = (postId: string) => `pickup_receiver_${postId}`;
