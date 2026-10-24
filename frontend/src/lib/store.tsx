"use client";

// Demo-mode data layer. Holds users, posts, claims, logs, rewards and the points ledger in React
// state, persisted to localStorage. Points/streak rules mirror backend/src/lib/points.ts so that
// swapping this for the real API later is a drop-in change (same action names, same results).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DEMO_CLAIMS, DEMO_LOGS, DEMO_POSTS, DEMO_REWARDS, DEMO_USERS } from "./demo-data";
import { avatarColorFor, initialsOf, nowIso, randomCode, slugify, uid } from "./format";
import { DEFAULT_LOCATION, haversineKm, nearestNeighbourhood } from "./geo";
import { MARKHAM_DIVERSION_TARGET, POINTS, isDiverted, nextStreak, pointsForLog } from "./points";
import type {
  Category,
  Claim,
  Condition,
  LatLng,
  LedgerEntry,
  LogEntry,
  PointsReason,
  Post,
  Redemption,
  Reward,
  ScanItem,
  Stream,
  User,
} from "./types";

export const STORAGE_KEY = "remarkham.demo.v1";
const VERSION = 1;

export type State = {
  version: number;
  currentUserId: string | null;
  locationGranted: boolean | null; // null = never asked
  users: User[];
  posts: Post[];
  claims: Claim[];
  logs: LogEntry[];
  ledger: LedgerEntry[];
  redemptions: Redemption[];
  rewards: Reward[];
};

export type Stats = {
  itemsLogged: number;
  itemsDiverted: number;
  kgDiverted: number;
  diversionRate: number; // 0–1
  target: number; // 0–1
  itemsGiven: number;
  itemsReceived: number;
  byStream: Array<{ stream: Stream; count: number }>;
  points: number;
  streakCount: number;
};

export type NewPostInput = {
  title: string;
  description: string;
  category: Category;
  condition: Condition;
  photoURL: string;
  fromScanId?: string;
};

export function seedState(): State {
  return {
    version: VERSION,
    currentUserId: null,
    locationGranted: null,
    users: DEMO_USERS(),
    posts: DEMO_POSTS(),
    claims: DEMO_CLAIMS(),
    logs: DEMO_LOGS(),
    ledger: [],
    redemptions: [],
    rewards: DEMO_REWARDS(),
  };
}

function loadState(): State {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<State>;
    if (parsed.version !== VERSION || !Array.isArray(parsed.users)) return seedState();
    // Rewards are a static catalog (no user data) — always refresh from the seed.
    return { ...seedState(), ...parsed, rewards: DEMO_REWARDS() } as State;
  } catch {
    return seedState();
  }
}

function saveState(state: State) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Could not persist demo state (storage full or blocked):", err);
  }
}

// ---- pure state transitions -------------------------------------------------------------------

function updateUser(state: State, userId: string, patch: Partial<User>): State {
  return { ...state, users: state.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)) };
}

function award(state: State, userId: string, delta: number, reason: PointsReason, refId?: string): State {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return state;
  const entry: LedgerEntry = { id: uid(), userId, delta, reason, refId, createdAt: nowIso() };
  return {
    ...updateUser(state, userId, { points: Math.max(0, user.points + delta) }),
    ledger: [entry, ...state.ledger],
  };
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

function computeStats(state: State, user: User | null): Stats {
  if (!user) {
    return {
      itemsLogged: 0,
      itemsDiverted: 0,
      kgDiverted: 0,
      diversionRate: 0,
      target: MARKHAM_DIVERSION_TARGET,
      itemsGiven: 0,
      itemsReceived: 0,
      byStream: [],
      points: 0,
      streakCount: 0,
    };
  }
  const logs = state.logs.filter((l) => l.userId === user.id);
  const diverted = logs.filter((l) => l.diverted);
  const counts = new Map<Stream, number>();
  for (const l of logs) counts.set(l.stream, (counts.get(l.stream) ?? 0) + 1);
  const byStream = [...counts.entries()].map(([stream, count]) => ({ stream, count })).sort((a, b) => b.count - a.count);
  return {
    itemsLogged: logs.length,
    itemsDiverted: diverted.length,
    kgDiverted: diverted.reduce((sum, l) => sum + l.estWeightG, 0) / 1000,
    diversionRate: logs.length ? diverted.length / logs.length : 0,
    target: MARKHAM_DIVERSION_TARGET,
    itemsGiven: state.posts.filter((p) => p.ownerId === user.id && p.status === "picked_up").length,
    itemsReceived: state.posts.filter((p) => p.claimerId === user.id && p.status === "picked_up").length,
    byStream,
    points: user.points,
    streakCount: user.streakCount,
  };
}

// ---- context ----------------------------------------------------------------------------------

export type Store = {
  state: State;
  hydrated: boolean;
  currentUser: User | null;
  stats: Stats;
  userById: (id: string) => User | undefined;
  claimsFor: (postId: string) => Claim[];
  hasClaimed: (postId: string) => boolean;
  distanceTo: (loc: LatLng) => number;

  login: (opts: { userId?: string; name?: string }) => User;
  logout: () => void;
  setLocation: (loc: LatLng, granted: boolean) => void;
  claimPost: (postId: string) => { ok: boolean; error?: string };
  confirmPickup: (
    postId: string,
    claimerId: string,
    photoURL: string,
  ) => { ok: boolean; error?: string; ownerDelta: number; claimerDelta: number };
  createPost: (input: NewPostInput) => { post: Post; delta: number; streakCount: number; bonus: boolean };
  logItems: (items: ScanItem[], scanId?: string) => { delta: number; streakCount: number; bonus: boolean; count: number };
  redeem: (rewardId: string) => { ok: boolean; code?: string; error?: string };
  resetDemo: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seedState);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);

  useEffect(() => {
    const loaded = loadState();
    stateRef.current = loaded;
    setState(loaded);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  /** Apply a synchronous transition and return a value computed from it. */
  const commit = useCallback(<R,>(fn: (s: State) => { state: State; result: R }): R => {
    const { state: next, result } = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    return result;
  }, []);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? null,
    [state.users, state.currentUserId],
  );
  const stats = useMemo(() => computeStats(state, currentUser), [state, currentUser]);

  const userById = useCallback((id: string) => state.users.find((u) => u.id === id), [state.users]);
  const claimsFor = useCallback(
    (postId: string) =>
      state.claims.filter((c) => c.postId === postId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [state.claims],
  );
  const hasClaimed = useCallback(
    (postId: string) => !!currentUser && state.claims.some((c) => c.postId === postId && c.userId === currentUser.id),
    [state.claims, currentUser],
  );
  const distanceTo = useCallback(
    (loc: LatLng) => haversineKm(currentUser?.location ?? DEFAULT_LOCATION, loc),
    [currentUser],
  );

  const login = useCallback<Store["login"]>(
    ({ userId, name }) =>
      commit((s) => {
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
              isDemo: false,
            };
            s = { ...s, users: [...s.users, user] };
          }
        }
        if (!user) throw new Error("login() needs a userId or a name");
        return { state: { ...s, currentUserId: user.id }, result: user };
      }),
    [commit],
  );

  const logout = useCallback(() => {
    commit((s) => ({ state: { ...s, currentUserId: null }, result: undefined }));
  }, [commit]);

  const setLocation = useCallback<Store["setLocation"]>(
    (loc, granted) => {
      commit((s) => {
        if (!s.currentUserId) return { state: { ...s, locationGranted: granted }, result: undefined };
        return {
          state: {
            ...updateUser(s, s.currentUserId, { location: loc, neighbourhood: nearestNeighbourhood(loc) }),
            locationGranted: granted,
          },
          result: undefined,
        };
      });
    },
    [commit],
  );

  const claimPost = useCallback<Store["claimPost"]>(
    (postId) =>
      commit<{ ok: boolean; error?: string }>((s) => {
        const me = s.currentUserId;
        const post = s.posts.find((p) => p.id === postId);
        if (!me) return { state: s, result: { ok: false, error: "Sign in first" } };
        if (!post) return { state: s, result: { ok: false, error: "Post not found" } };
        if (post.ownerId === me) return { state: s, result: { ok: false, error: "You can't claim your own item" } };
        if (post.status !== "open") return { state: s, result: { ok: false, error: "This item is already gone" } };
        if (s.claims.some((c) => c.postId === postId && c.userId === me))
          return { state: s, result: { ok: false, error: "You already asked for this" } };
        const claim: Claim = { postId, userId: me, createdAt: nowIso() };
        return { state: { ...s, claims: [...s.claims, claim] }, result: { ok: true } };
      }),
    [commit],
  );

  const confirmPickup = useCallback<Store["confirmPickup"]>(
    (postId, claimerId, photoURL) =>
      commit<{ ok: boolean; error?: string; ownerDelta: number; claimerDelta: number }>((s) => {
        const me = s.currentUserId;
        const post = s.posts.find((p) => p.id === postId);
        const fail = (error: string) => ({ state: s, result: { ok: false, error, ownerDelta: 0, claimerDelta: 0 } });
        if (!me) return fail("Sign in first");
        if (!post) return fail("Post not found");
        if (post.ownerId !== me) return fail("Only the owner can confirm a pickup");
        if (post.status !== "open") return fail("This item was already given away");
        if (!s.claims.some((c) => c.postId === postId && c.userId === claimerId))
          return fail("That person hasn't asked for this item");

        let next: State = {
          ...s,
          posts: s.posts.map((p) =>
            p.id === postId
              ? { ...p, status: "picked_up", claimerId, pickupPhotoURL: photoURL, pickedUpAt: nowIso() }
              : p,
          ),
        };
        next = award(next, me, POINTS.pickup_giver, "pickup_giver", postId);
        next = award(next, claimerId, POINTS.pickup_receiver, "pickup_receiver", postId);
        return {
          state: next,
          result: { ok: true, ownerDelta: POINTS.pickup_giver, claimerDelta: POINTS.pickup_receiver },
        };
      }),
    [commit],
  );

  const createPost = useCallback<Store["createPost"]>(
    (input) =>
      commit((s) => {
        const me = s.users.find((u) => u.id === s.currentUserId);
        if (!me) throw new Error("Sign in first");
        const post: Post = {
          id: uid(),
          ownerId: me.id,
          title: input.title.trim(),
          description: input.description.trim(),
          category: input.category,
          condition: input.condition,
          photoURL: input.photoURL,
          location: me.location,
          neighbourhood: me.neighbourhood,
          status: "open",
          fromScanId: input.fromScanId,
          createdAt: nowIso(),
        };
        let next: State = { ...s, posts: [post, ...s.posts] };
        next = award(next, me.id, POINTS.post_created, "post_created", post.id);
        const streak = touchStreak(next, me.id);
        return {
          state: streak.state,
          result: { post, delta: POINTS.post_created, streakCount: streak.streakCount, bonus: streak.bonus },
        };
      }),
    [commit],
  );

  const logItems = useCallback<Store["logItems"]>(
    (items, scanId) =>
      commit((s) => {
        const me = s.users.find((u) => u.id === s.currentUserId);
        if (!me) throw new Error("Sign in first");
        let next = s;
        let delta = 0;
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
          delta += p.delta;
          next = award(next, me.id, p.delta, p.reason, log.id);
        }
        next = { ...next, logs: [...logs.reverse(), ...next.logs] };
        const streak = touchStreak(next, me.id);
        return {
          state: streak.state,
          result: { delta, streakCount: streak.streakCount, bonus: streak.bonus, count: items.length },
        };
      }),
    [commit],
  );

  const redeem = useCallback<Store["redeem"]>(
    (rewardId) =>
      commit<{ ok: boolean; code?: string; error?: string }>((s) => {
        const me = s.users.find((u) => u.id === s.currentUserId);
        const reward = s.rewards.find((r) => r.id === rewardId);
        if (!me) return { state: s, result: { ok: false, error: "Sign in first" } };
        if (!reward) return { state: s, result: { ok: false, error: "Reward not found" } };
        if (me.points < reward.cost)
          return { state: s, result: { ok: false, error: `You need ${reward.cost - me.points} more points` } };
        const redemption: Redemption = { id: uid(), userId: me.id, rewardId, code: randomCode(6), createdAt: nowIso() };
        let next: State = { ...s, redemptions: [redemption, ...s.redemptions] };
        next = award(next, me.id, -reward.cost, "redeem", redemption.id);
        return { state: next, result: { ok: true, code: redemption.code } };
      }),
    [commit],
  );

  const resetDemo = useCallback(() => {
    commit(() => ({ state: seedState(), result: undefined }));
  }, [commit]);

  const value = useMemo<Store>(
    () => ({
      state,
      hydrated,
      currentUser,
      stats,
      userById,
      claimsFor,
      hasClaimed,
      distanceTo,
      login,
      logout,
      setLocation,
      claimPost,
      confirmPickup,
      createPost,
      logItems,
      redeem,
      resetDemo,
    }),
    [
      state,
      hydrated,
      currentUser,
      stats,
      userById,
      claimsFor,
      hasClaimed,
      distanceTo,
      login,
      logout,
      setLocation,
      claimPost,
      confirmPickup,
      createPost,
      logItems,
      redeem,
      resetDemo,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
