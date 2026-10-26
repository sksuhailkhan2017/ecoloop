// Production data source: Firestore via the client SDK, secured by /firestore.rules.
// Points are client-computed (see README → Known limits); every point change writes users.points
// and a ledger entry in the same transaction so balances and history never drift apart.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase/firestore";

import { withTimeout } from "../async";
import { toUser } from "../db/users";
import { getDb } from "../firebase.client";
import { nowIso, randomCode } from "../format";
import { MAX_LOG_POINTS_PER_DAY, POINTS, giverHandoverLimit, isDiverted, nextStreak, pointsForLog, postPointsFor, receiverHandoverLimit, todayInToronto } from "../points";
import { rewardById } from "../rewards";
import type { Claim, LedgerEntry, LogEntry, PointsReason, Post, Redemption, User } from "../types";
import {
  receiverLedgerId,
  type CreatePostResult,
  type DataSource,
  type LogResult,
  type OnError,
  type PickupResult,
} from "./source";

const WRITE_TIMEOUT_MS = 15_000;
/** Newest posts loaded for the feed (open + recently given away are split client-side). */
const FEED_LIMIT = 150;
const READ_TIMEOUT_MS = 10_000;

function db(): Firestore {
  const d = getDb();
  if (!d) throw new Error("Firestore is not configured");
  return d;
}

const userRef = (uid: string) => doc(db(), "users", uid);
const postRef = (id: string) => doc(db(), "posts", id);
const claimRef = (postId: string, uid: string) => doc(db(), "posts", postId, "claims", uid);
const newRef = (col: "posts" | "ledger" | "logs" | "redemptions") => doc(collection(db(), col));

const fromDoc = <T extends { id: string }>(snap: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData | undefined }): T =>
  ({ ...(snap.data() as Omit<T, "id">), id: snap.id }) as T;

function withoutId<T extends { id: string }>(x: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...x };
  delete copy.id;
  return copy as Omit<T, "id">;
}

/** Turns Firestore error codes into copy a person can act on. */
function friendly(err: unknown, fallback: string): Error {
  const code = (err as { code?: string }).code ?? "";
  if (err instanceof Error && err.name === "TimeoutError") return err;
  if (code === "permission-denied") return new Error("Not allowed — this action was rejected by the security rules.");
  if (code === "unavailable" || code === "deadline-exceeded") return new Error("Can't reach the database right now. Check your connection.");
  if (code === "resource-exhausted") return new Error("The free database quota is used up for today. Try again tomorrow.");
  if (err instanceof Error && !code) return err; // our own validation messages
  return new Error(fallback);
}

async function run<T>(fallback: string, fn: () => Promise<T>, ms = WRITE_TIMEOUT_MS): Promise<T> {
  try {
    return await withTimeout(fn(), ms);
  } catch (err) {
    throw friendly(err, fallback);
  }
}

async function readUserTx(tx: Transaction, uid: string): Promise<User> {
  const snap = await tx.get(userRef(uid));
  if (!snap.exists()) throw new Error("Your profile is missing. Sign out and back in.");
  return toUser(uid, snap.data());
}

const ledgerEntry = (userId: string, delta: number, reason: PointsReason, refId?: string): Omit<LedgerEntry, "id"> => ({
  userId,
  delta,
  reason,
  refId,
  createdAt: nowIso(),
});

/** Streak bump for "activity" actions (log, post). Returns the user patch and any streak bonus. */
function streakPatch(u: User): { patch: Pick<User, "streakCount" | "lastActiveDate">; bonus: boolean; streakCount: number } {
  const r = nextStreak(u.lastActiveDate, u.streakCount);
  return { patch: { streakCount: r.streakCount, lastActiveDate: r.lastActiveDate }, bonus: r.changed && r.bonus, streakCount: r.streakCount };
}

const userCache = new Map<string, Promise<User | null>>();
const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

export const firestoreSource: DataSource = {
  mode: "firestore",

  // ---- live reads --------------------------------------------------------------------------

  // Queries below deliberately avoid composite indexes (single-field only), so the project works
  // without `firebase deploy --only firestore:indexes`. Sorting/filtering of a user's own small
  // collections happens client-side.
  subscribeFeed(cb, onError) {
    return onSnapshot(
      query(collection(db(), "posts"), orderBy("createdAt", "desc"), limit(FEED_LIMIT)),
      (s) => {
        const posts = s.docs.map((x) => fromDoc<Post>(x));
        const open = posts.filter((p) => p.status === "open");
        const gone = posts.filter((p) => p.status === "picked_up").slice(0, 30);
        cb([...open, ...gone]);
      },
      (err) => onError(friendly(err, "Couldn't load the feed.")),
    );
  },

  subscribePost(id, cb, onError) {
    return onSnapshot(
      postRef(id),
      (s) => cb(s.exists() ? fromDoc<Post>(s) : null),
      (err) => onError(friendly(err, "Couldn't load this post.")),
    );
  },

  subscribeClaims(postId, viewer, cb, onError) {
    const wrap: OnError = (err) => onError(friendly(err, "Couldn't load requests."));
    if (viewer.isOwner) {
      return onSnapshot(
        query(collection(db(), "posts", postId, "claims"), orderBy("createdAt")),
        (s) => cb(s.docs.map((x) => ({ postId, userId: x.id, createdAt: (x.data() as Claim).createdAt }))),
        wrap,
      );
    }
    return onSnapshot(
      claimRef(postId, viewer.uid),
      (s) => cb(s.exists() ? [{ postId, userId: viewer.uid, createdAt: (s.data() as Claim).createdAt }] : []),
      wrap,
    );
  },

  subscribeMyPosts(uid, cb, onError) {
    return onSnapshot(
      query(collection(db(), "posts"), where("ownerId", "==", uid)),
      (s) => cb(s.docs.map((x) => fromDoc<Post>(x)).sort(byNewest)),
      (err) => onError(friendly(err, "Couldn't load your listings.")),
    );
  },

  subscribeReceivedPosts(uid, cb, onError) {
    return onSnapshot(
      query(collection(db(), "posts"), where("claimerId", "==", uid), where("status", "==", "picked_up")),
      (s) => cb(s.docs.map((x) => fromDoc<Post>(x))),
      (err) => onError(friendly(err, "Couldn't load received items.")),
    );
  },

  subscribeMyLogs(uid, cb, onError) {
    return onSnapshot(
      query(collection(db(), "logs"), where("userId", "==", uid)),
      (s) => cb(s.docs.map((x) => fromDoc<LogEntry>(x)).sort(byNewest)),
      (err) => onError(friendly(err, "Couldn't load your log.")),
    );
  },

  subscribeMyRedemptions(uid, cb, onError) {
    return onSnapshot(
      query(collection(db(), "redemptions"), where("userId", "==", uid)),
      (s) => cb(s.docs.map((x) => fromDoc<Redemption>(x)).sort(byNewest)),
      (err) => onError(friendly(err, "Couldn't load your redemptions.")),
    );
  },

  getUser(id) {
    let p = userCache.get(id);
    if (!p) {
      p = withTimeout(getDoc(userRef(id)), READ_TIMEOUT_MS)
        .then((s) => (s.exists() ? toUser(id, s.data()) : null))
        .catch((err) => {
          userCache.delete(id); // let the next render retry
          throw err;
        });
      userCache.set(id, p);
    }
    return p;
  },

  // ---- writes ------------------------------------------------------------------------------

  createPost(me, input): Promise<CreatePostResult> {
    return run("Couldn't publish your post.", async () => {
      const d = db();
      const ref = newRef("posts");
      // Anti-farming: post points are capped per day; the listing itself always goes live.
      const postLedger = await getDocs(query(collection(d, "ledger"), where("userId", "==", me.id), where("reason", "==", "post_created")));
      const award = postPointsFor(postLedger.docs.map((x) => x.data() as LedgerEntry));
      return runTransaction(d, async (tx) => {
        const u = await readUserTx(tx, me.id);
        const post: Post = {
          id: ref.id,
          ownerId: me.id,
          title: input.title.trim().slice(0, 80),
          description: input.description.trim().slice(0, 600),
          category: input.category,
          condition: input.condition,
          photoURL: input.photoURL,
          location: u.location,
          neighbourhood: u.neighbourhood,
          status: "open",
          claimCount: 0,
          fromScanId: input.fromScanId,
          createdAt: nowIso(),
        };
        tx.set(ref, withoutId(post));
        let delta = award;
        if (award > 0) tx.set(newRef("ledger"), ledgerEntry(me.id, award, "post_created", ref.id));
        const streak = streakPatch(u);
        if (streak.bonus) {
          tx.set(newRef("ledger"), ledgerEntry(me.id, POINTS.streak_7, "streak_7"));
          delta += POINTS.streak_7;
        }
        tx.update(userRef(me.id), { ...streak.patch, points: u.points + delta });
        return { post, delta: award, streakCount: streak.streakCount, bonus: streak.bonus, capped: award === 0 };
      });
    });
  },

  claimPost(me, post) {
    return run("Couldn't send your request.", async () => {
      if (post.isSample) throw new Error("Sample listings can't be claimed — they're just here to show how EcoLoop works.");
      if (post.ownerId === me.id) throw new Error("You can't claim your own item");
      if (post.status !== "open") throw new Error("This item is already gone");
      const batch = writeBatch(db());
      batch.set(claimRef(post.id, me.id), { userId: me.id, createdAt: nowIso() });
      batch.update(postRef(post.id), { claimCount: increment(1) });
      try {
        await batch.commit();
      } catch (err) {
        if ((err as { code?: string }).code === "permission-denied") throw new Error("You already asked for this, or it was just given away.");
        throw err;
      }
    });
  },

  confirmPickup(me, post, claimerId, photoURL): Promise<PickupResult> {
    return run("Couldn't confirm the pickup.", async () => {
      if (post.ownerId !== me.id) throw new Error("Only the owner can confirm a pickup");
      if (post.status !== "open") throw new Error("This item was already given away");
      const d = db();

      // Anti-farming checks need queries, which client transactions can't run — read first.
      const [given, received, handoverLedger, claimer] = await Promise.all([
        getDocs(query(collection(d, "posts"), where("ownerId", "==", me.id), where("status", "==", "picked_up"))),
        getDocs(query(collection(d, "posts"), where("claimerId", "==", me.id), where("status", "==", "picked_up"))),
        getDocs(query(collection(d, "ledger"), where("userId", "==", me.id), where("reason", "in", ["pickup_giver", "pickup_receiver"]))),
        firestoreSource.getUser(claimerId),
      ]);
      const limited = giverHandoverLimit({
        ownerIsGuest: me.isGuest === true,
        claimerIsGuest: claimer?.isGuest !== false,
        priorHandovers: [...given.docs, ...received.docs].map((x) => fromDoc<Post>(x)),
        myHandoverLedger: handoverLedger.docs.map((x) => x.data() as LedgerEntry),
        me: me.id,
        claimerId,
        postId: post.id,
      });

      await runTransaction(d, async (tx) => {
        const fresh = await tx.get(postRef(post.id));
        if (!fresh.exists() || (fresh.data() as Post).status !== "open") throw new Error("This item was already given away");
        const claim = await tx.get(claimRef(post.id, claimerId));
        if (!claim.exists()) throw new Error("That person hasn't asked for this item");
        const u = await readUserTx(tx, me.id);
        tx.update(postRef(post.id), {
          status: "picked_up",
          claimerId,
          pickupPhotoURL: photoURL || undefined,
          pickedUpAt: nowIso(),
          pointsAwarded: !limited,
        });
        if (!limited) {
          tx.set(newRef("ledger"), ledgerEntry(me.id, POINTS.pickup_giver, "pickup_giver", post.id));
          tx.update(userRef(me.id), { points: u.points + POINTS.pickup_giver });
        }
      });
      return { ownerDelta: limited ? 0 : POINTS.pickup_giver, claimerDelta: limited ? 0 : POINTS.pickup_receiver, limited };
    });
  },

  creditReceivedPickup(me, post) {
    if (post.status !== "picked_up" || post.claimerId !== me.id || !post.pointsAwarded) return Promise.resolve(false);
    if (me.isGuest) return Promise.resolve(false); // handover points need a linked account (rules enforce it too)
    return run("Couldn't credit your pickup points.", async () => {
      const d = db();
      // Already credited, or over the receiver caps? Checked against my own ledger (readable by me).
      const mine = await getDocs(query(collection(d, "ledger"), where("userId", "==", me.id), where("reason", "in", ["pickup_giver", "pickup_receiver"])));
      const entries = mine.docs.map((x) => x.data() as LedgerEntry);
      if (entries.some((e) => e.reason === "pickup_receiver" && e.refId === post.id)) return false;
      if (receiverHandoverLimit(entries)) return false;
      const ref = doc(d, "ledger", receiverLedgerId(post.id));
      return runTransaction(d, async (tx) => {
        const u = await readUserTx(tx, me.id);
        tx.set(ref, ledgerEntry(me.id, POINTS.pickup_receiver, "pickup_receiver", post.id));
        tx.update(userRef(me.id), { points: u.points + POINTS.pickup_receiver });
        return true;
      });
    });
  },

  logItems(me, items, scanId): Promise<LogResult> {
    return run("Couldn't save your log.", async () => {
      const d = db();
      const today = todayInToronto();
      const recent = await getDocs(query(collection(d, "ledger"), where("userId", "==", me.id), where("reason", "in", ["log_diverted", "log_garbage"])));
      const awardedToday = recent.docs
        .map((x) => x.data() as LedgerEntry)
        .filter((e) => todayInToronto(new Date(e.createdAt)) === today)
        .reduce((sum, e) => sum + e.delta, 0);

      return runTransaction(d, async (tx) => {
        const u = await readUserTx(tx, me.id);
        let remaining = Math.max(0, MAX_LOG_POINTS_PER_DAY - awardedToday);
        let delta = 0;
        for (const item of items) {
          const logRef = newRef("logs");
          const log: Omit<LogEntry, "id"> = {
            userId: me.id,
            scanId,
            itemName: item.name,
            stream: item.stream,
            binLabel: item.binLabel,
            estWeightG: item.estWeightG,
            diverted: isDiverted(item.stream),
            createdAt: nowIso(),
          };
          tx.set(logRef, log);
          const p = pointsForLog(item.stream);
          const awardable = Math.min(p.delta, remaining);
          remaining -= awardable;
          delta += awardable;
          if (awardable > 0) tx.set(newRef("ledger"), ledgerEntry(me.id, awardable, p.reason, logRef.id));
        }
        const streak = streakPatch(u);
        let total = delta;
        if (streak.bonus) {
          tx.set(newRef("ledger"), ledgerEntry(me.id, POINTS.streak_7, "streak_7"));
          total += POINTS.streak_7;
        }
        tx.update(userRef(me.id), { ...streak.patch, points: u.points + total });
        return { delta, streakCount: streak.streakCount, bonus: streak.bonus, count: items.length, capped: remaining === 0 && delta < items.length };
      });
    });
  },

  redeem(me, rewardId) {
    return run("Couldn't redeem that reward.", async () => {
      const reward = rewardById(rewardId);
      if (!reward) throw new Error("Reward not found");
      return runTransaction(db(), async (tx) => {
        const u = await readUserTx(tx, me.id);
        if (u.points < reward.cost) throw new Error(`You need ${reward.cost - u.points} more points`);
        const ref = newRef("redemptions");
        const code = randomCode(6);
        const redemption: Omit<Redemption, "id"> = { userId: me.id, rewardId, code, createdAt: nowIso() };
        tx.set(ref, redemption);
        tx.set(newRef("ledger"), ledgerEntry(me.id, -reward.cost, "redeem", ref.id));
        tx.update(userRef(me.id), { points: u.points - reward.cost });
        return { code };
      });
    });
  },
};
