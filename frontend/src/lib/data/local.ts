// DEMO MODE data source (no Firebase config): everything lives in this browser's localStorage,
// seeded with fictional neighbours and listings. Same rules as the Firestore source — points,
// streaks, daily caps and anti-collusion — so the two behave identically in the UI.
import { DEMO_CLAIMS, DEMO_LOGS, DEMO_POSTS, DEMO_USERS } from "../demo-data";
import { avatarColorFor, initialsOf, nowIso, randomCode, slugify, uid } from "../format";
import { DEFAULT_LOCATION, nearestNeighbourhood } from "../geo";
import { MAX_LOG_POINTS_PER_DAY, POINTS, isDiverted, nextStreak, pointsForLog, todayInToronto } from "../points";
import { rewardById } from "../rewards";
import type { Claim, LedgerEntry, LogEntry, PointsReason, Post, Redemption, User } from "../types";
import { MAX_PICKUP_POINTS_PER_DAY, PAIR_COOLDOWN_DAYS, type DataSource, type Unsub } from "./source";

export const STORAGE_KEY = "ecoloop.demo.v2";

type State = {
  currentUserId: string | null;
  users: User[];
  posts: Post[];
  claims: Claim[];
  logs: LogEntry[];
  ledger: LedgerEntry[];
  redemptions: Redemption[];
};

function seedState(): State {
  return { currentUserId: null, users: DEMO_USERS(), posts: DEMO_POSTS(), claims: DEMO_CLAIMS(), logs: DEMO_LOGS(), ledger: [], redemptions: [] };
}

class LocalStore {
  private state: State = seedState();
  private loaded = false;
  private listeners = new Set<() => void>();

  /** Lazily reads localStorage (browser only). Safe to call repeatedly. */
  ensureLoaded() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>;
        if (Array.isArray(parsed.users)) this.state = { ...seedState(), ...parsed } as State;
      }
    } catch {
      this.state = seedState();
    }
  }

  get isLoaded() {
    return this.loaded;
  }

  get(): State {
    return this.state;
  }

  subscribe(fn: () => void): Unsub {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  commit<R>(fn: (s: State) => { state: State; result: R }): R {
    this.ensureLoaded();
    const { state, result } = fn(this.state);
    if (state !== this.state) {
      this.state = state;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Demo mode: could not persist (storage full or blocked):", err);
      }
      for (const l of this.listeners) l();
    }
    return result;
  }

  reset() {
    this.commit(() => ({ state: seedState(), result: undefined }));
  }
}

export const localStore = new LocalStore();

// ---- pure transitions -------------------------------------------------------------------------

function updateUser(state: State, userId: string, patch: Partial<User>): State {
  return { ...state, users: state.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)) };
}

function award(state: State, userId: string, delta: number, reason: PointsReason, refId?: string): State {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return state;
  const entry: LedgerEntry = { id: uid(), userId, delta, reason, refId, createdAt: nowIso() };
  return { ...updateUser(state, userId, { points: Math.max(0, user.points + delta) }), ledger: [entry, ...state.ledger] };
}

function touchStreak(state: State, userId: string): { state: State; streakCount: number; bonus: boolean } {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return { state, streakCount: 0, bonus: false };
  const r = nextStreak(user.lastActiveDate, user.streakCount);
  let next = updateUser(state, userId, { streakCount: r.streakCount, lastActiveDate: r.lastActiveDate });
  const bonus = r.changed && r.bonus;
  if (bonus) next = award(next, userId, POINTS.streak_7, "streak_7");
  return { state: next, streakCount: r.streakCount, bonus };
}

function withClaimCounts(posts: Post[], claims: Claim[]): Post[] {
  const counts = new Map<string, number>();
  for (const c of claims) counts.set(c.postId, (counts.get(c.postId) ?? 0) + 1);
  return posts.map((p) => ({ ...p, claimCount: counts.get(p.id) ?? 0 }));
}

/** Subscribe to a derived slice; emits immediately and after every commit. */
function live<T>(select: (s: State) => T, cb: (v: T) => void): Unsub {
  localStore.ensureLoaded();
  cb(select(localStore.get()));
  return localStore.subscribe(() => cb(select(localStore.get())));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- demo session (used by lib/auth.tsx when Firebase is not configured) -----------------------

export const localSession = {
  subscribe(cb: (user: User | null, demoUsers: User[]) => void): Unsub {
    return live(
      (s) => [s.users.find((u) => u.id === s.currentUserId) ?? null, s.users.filter((u) => u.isDemo).slice(0, 6)] as const,
      ([user, demoUsers]) => cb(user, demoUsers),
    );
  },
  login({ userId, name }: { userId?: string; name?: string }): User {
    return localStore.commit((s) => {
      let user = userId ? s.users.find((u) => u.id === userId) : undefined;
      if (!user && name) {
        const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
        user = s.users.find((u) => u.name.toLowerCase() === clean.toLowerCase());
        if (!user) {
          user = {
            id: uid(),
            name: clean,
            handle: slugify(clean) || "neighbour",
            initials: initialsOf(clean),
            avatarColor: avatarColorFor(clean),
            neighbourhood: nearestNeighbourhood(DEFAULT_LOCATION),
            points: 0,
            streakCount: 0,
            location: DEFAULT_LOCATION,
            joinedAt: nowIso(),
            isGuest: clean.startsWith("Neighbour "),
          };
          s = { ...s, users: [...s.users, user] };
        }
      }
      if (!user) throw new Error("Pick a profile or enter a name");
      return { state: { ...s, currentUserId: user.id }, result: user };
    });
  },
  logout() {
    localStore.commit((s) => ({ state: s.currentUserId ? { ...s, currentUserId: null } : s, result: undefined }));
  },
  patchUser(patch: Partial<Omit<User, "id">>) {
    localStore.commit((s) => ({ state: s.currentUserId ? updateUser(s, s.currentUserId, patch) : s, result: undefined }));
  },
  reset() {
    localStore.reset();
  },
};

// ---- DataSource -------------------------------------------------------------------------------

export const localSource: DataSource = {
  mode: "local",

  subscribeFeed: (cb) => live((s) => withClaimCounts(s.posts, s.claims), cb),
  subscribePost: (id, cb) => live((s) => withClaimCounts(s.posts, s.claims).find((p) => p.id === id) ?? null, cb),
  subscribeClaims: (postId, viewer, cb) =>
    live(
      (s) =>
        s.claims
          .filter((c) => c.postId === postId && (viewer.isOwner || c.userId === viewer.uid))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      cb,
    ),
  subscribeMyPosts: (uid, cb) => live((s) => withClaimCounts(s.posts, s.claims).filter((p) => p.ownerId === uid), cb),
  subscribeReceivedPosts: (uid, cb) => live((s) => s.posts.filter((p) => p.claimerId === uid && p.status === "picked_up"), cb),
  subscribeMyLogs: (uid, cb) => live((s) => s.logs.filter((l) => l.userId === uid), cb),
  subscribeMyRedemptions: (uid, cb) => live((s) => s.redemptions.filter((r) => r.userId === uid), cb),

  async getUser(id) {
    localStore.ensureLoaded();
    return localStore.get().users.find((u) => u.id === id) ?? null;
  },

  async createPost(me, input) {
    await delay(350); // a hint of network so loading states are visible in demo mode
    return localStore.commit((s) => {
      const owner = s.users.find((u) => u.id === me.id);
      if (!owner) throw new Error("Sign in first");
      const post: Post = {
        id: uid(),
        ownerId: owner.id,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        condition: input.condition,
        photoURL: input.photoURL,
        location: owner.location,
        neighbourhood: owner.neighbourhood,
        status: "open",
        claimCount: 0,
        fromScanId: input.fromScanId,
        createdAt: nowIso(),
      };
      let next: State = { ...s, posts: [post, ...s.posts] };
      next = award(next, owner.id, POINTS.post_created, "post_created", post.id);
      const streak = touchStreak(next, owner.id);
      return { state: streak.state, result: { post, delta: POINTS.post_created, streakCount: streak.streakCount, bonus: streak.bonus } };
    });
  },

  async claimPost(me, post) {
    await delay(250);
    localStore.commit((s) => {
      if (post.isSample) throw new Error("Sample listings can't be claimed.");
      if (post.ownerId === me.id) throw new Error("You can't claim your own item");
      const current = s.posts.find((p) => p.id === post.id);
      if (!current || current.status !== "open") throw new Error("This item is already gone");
      if (s.claims.some((c) => c.postId === post.id && c.userId === me.id)) throw new Error("You already asked for this");
      return { state: { ...s, claims: [...s.claims, { postId: post.id, userId: me.id, createdAt: nowIso() }] }, result: undefined };
    });
  },

  async confirmPickup(me, post, claimerId, photoURL) {
    await delay(400);
    return localStore.commit((s) => {
      const current = s.posts.find((p) => p.id === post.id);
      if (!current) throw new Error("Post not found");
      if (current.ownerId !== me.id) throw new Error("Only the owner can confirm a pickup");
      if (current.status !== "open") throw new Error("This item was already given away");
      if (!s.claims.some((c) => c.postId === post.id && c.userId === claimerId)) throw new Error("That person hasn't asked for this item");

      const now = Date.now();
      const samePairRecently = s.posts.some(
        (p) =>
          p.id !== post.id &&
          p.status === "picked_up" &&
          p.pickedUpAt &&
          now - new Date(p.pickedUpAt).getTime() < PAIR_COOLDOWN_DAYS * 86_400_000 &&
          ((p.ownerId === me.id && p.claimerId === claimerId) || (p.ownerId === claimerId && p.claimerId === me.id)),
      );
      const today = todayInToronto();
      const giverToday = s.ledger.filter((e) => e.userId === me.id && e.reason === "pickup_giver" && todayInToronto(new Date(e.createdAt)) === today).length;
      let limited: string | undefined;
      if (samePairRecently) limited = `You two already traded in the last ${PAIR_COOLDOWN_DAYS} days — no points this time.`;
      else if (giverToday >= MAX_PICKUP_POINTS_PER_DAY) limited = `Daily limit: points for ${MAX_PICKUP_POINTS_PER_DAY} handovers a day.`;

      let next: State = {
        ...s,
        posts: s.posts.map((p) =>
          p.id === post.id ? { ...p, status: "picked_up", claimerId, pickupPhotoURL: photoURL || undefined, pickedUpAt: nowIso(), pointsAwarded: !limited } : p,
        ),
      };
      if (!limited) {
        next = award(next, me.id, POINTS.pickup_giver, "pickup_giver", post.id);
        next = award(next, claimerId, POINTS.pickup_receiver, "pickup_receiver", post.id); // single device: credit both now
      }
      return { state: next, result: { ownerDelta: limited ? 0 : POINTS.pickup_giver, claimerDelta: limited ? 0 : POINTS.pickup_receiver, limited } };
    });
  },

  async creditReceivedPickup() {
    return false; // confirmPickup already credited the receiver (same browser)
  },

  async logItems(me, items, scanId) {
    await delay(300);
    return localStore.commit((s) => {
      const user = s.users.find((u) => u.id === me.id);
      if (!user) throw new Error("Sign in first");
      const today = todayInToronto();
      const awardedToday = s.ledger
        .filter((e) => e.userId === me.id && (e.reason === "log_diverted" || e.reason === "log_garbage") && todayInToronto(new Date(e.createdAt)) === today)
        .reduce((sum, e) => sum + e.delta, 0);
      let remaining = Math.max(0, MAX_LOG_POINTS_PER_DAY - awardedToday);
      let delta = 0;
      let next = s;
      const logs: LogEntry[] = [];
      for (const item of items) {
        const log: LogEntry = {
          id: uid(),
          userId: me.id,
          scanId,
          itemName: item.name,
          stream: item.stream,
          binLabel: item.binLabel,
          estWeightG: item.estWeightG,
          diverted: isDiverted(item.stream),
          createdAt: nowIso(),
        };
        logs.push(log);
        const p = pointsForLog(item.stream);
        const awardable = Math.min(p.delta, remaining);
        remaining -= awardable;
        delta += awardable;
        if (awardable > 0) next = award(next, me.id, awardable, p.reason, log.id);
      }
      next = { ...next, logs: [...logs.reverse(), ...next.logs] };
      const streak = touchStreak(next, me.id);
      return {
        state: streak.state,
        result: { delta, streakCount: streak.streakCount, bonus: streak.bonus, count: items.length, capped: remaining === 0 && delta < items.length },
      };
    });
  },

  async redeem(me, rewardId) {
    await delay(300);
    return localStore.commit((s) => {
      const user = s.users.find((u) => u.id === me.id);
      const reward = rewardById(rewardId);
      if (!user) throw new Error("Sign in first");
      if (!reward) throw new Error("Reward not found");
      if (user.points < reward.cost) throw new Error(`You need ${reward.cost - user.points} more points`);
      const redemption: Redemption = { id: uid(), userId: me.id, rewardId, code: randomCode(6), createdAt: nowIso() };
      let next: State = { ...s, redemptions: [redemption, ...s.redemptions] };
      next = award(next, me.id, -reward.cost, "redeem", redemption.id);
      return { state: next, result: { code: redemption.code } };
    });
  },
};
