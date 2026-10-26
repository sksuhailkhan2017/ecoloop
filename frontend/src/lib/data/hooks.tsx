"use client";

// React hooks over the data source. Every live read exposes { data, loading, error, slow, retry }
// so pages can show a skeleton, a "taking longer than usual" hint and an error state with retry.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { errorMessage } from "../async";
import { SAMPLE_OWNER } from "../sample-posts";
import { computeStats, type Stats } from "../stats";
import type { Claim, LogEntry, Post, Redemption, User } from "../types";
import { data } from "./index";
import type { OnError, Unsub } from "./source";

const SLOW_AFTER_MS = 8_000;

export type Live<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** No first result within 8 s — probably offline or Firestore is cold. */
  slow: boolean;
  retry: () => void;
};

type Subscriber<T> = (cb: (v: T) => void, onError: OnError) => Unsub;

/**
 * Generic live subscription. Pass `null` to disable (e.g. while the uid is unknown).
 * `key` must change whenever the subscription inputs change.
 */
export function useLive<T>(subscribe: Subscriber<T> | null, key: string): Live<T> {
  const [state, setState] = useState<{ key: string; data: T | undefined; error: string | null; slow: boolean }>({
    key,
    data: undefined,
    error: null,
    slow: false,
  });
  const [attempt, setAttempt] = useState(0);
  const enabled = subscribe !== null;
  const subRef = useRef(subscribe);
  subRef.current = subscribe;

  useEffect(() => {
    const sub = subRef.current;
    if (!sub) return;
    let got = false;
    setState((s) => (s.key === key ? { ...s, error: null, slow: false } : { key, data: undefined, error: null, slow: false }));
    const slowTimer = window.setTimeout(() => {
      if (!got) setState((s) => ({ ...s, slow: true }));
    }, SLOW_AFTER_MS);
    let unsub: Unsub = () => undefined;
    try {
      unsub = sub(
        (v) => {
          got = true;
          setState({ key, data: v, error: null, slow: false });
        },
        (err) => {
          got = true;
          setState((s) => ({ ...s, key, error: errorMessage(err), slow: false }));
        },
      );
    } catch (err) {
      setState({ key, data: undefined, error: errorMessage(err), slow: false });
    }
    return () => {
      window.clearTimeout(slowTimer);
      unsub();
    };
  }, [key, attempt, enabled]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = state.key === key ? state : { key, data: undefined, error: null, slow: false };
  return {
    data: enabled ? current.data : undefined,
    loading: enabled && current.data === undefined && !current.error,
    error: current.error,
    slow: current.slow,
    retry,
  };
}

export const useFeed = () => useLive<Post[]>((cb, e) => data.subscribeFeed(cb, e), "feed");

export const usePost = (id: string | null) => useLive<Post | null>(id ? (cb, e) => data.subscribePost(id, cb, e) : null, `post:${id}`);

export const useClaims = (postId: string | null, viewer: { uid: string; isOwner: boolean } | null) =>
  useLive<Claim[]>(
    postId && viewer ? (cb, e) => data.subscribeClaims(postId, viewer, cb, e) : null,
    `claims:${postId}:${viewer?.uid}:${viewer?.isOwner}`,
  );

export const useMyPosts = (uid: string | null) => useLive<Post[]>(uid ? (cb, e) => data.subscribeMyPosts(uid, cb, e) : null, `myposts:${uid}`);

export const useReceivedPosts = (uid: string | null) =>
  useLive<Post[]>(uid ? (cb, e) => data.subscribeReceivedPosts(uid, cb, e) : null, `received:${uid}`);

export const useMyLogs = (uid: string | null) => useLive<LogEntry[]>(uid ? (cb, e) => data.subscribeMyLogs(uid, cb, e) : null, `logs:${uid}`);

export const useMyRedemptions = (uid: string | null) =>
  useLive<Redemption[]>(uid ? (cb, e) => data.subscribeMyRedemptions(uid, cb, e) : null, `redemptions:${uid}`);

/** Profiles for a set of ids (owners on cards). Cached per id; sample owner resolves locally. */
export function useUsers(ids: string[]): Map<string, User> {
  const [users, setUsers] = useState<Map<string, User>>(() => new Map([[SAMPLE_OWNER.id, SAMPLE_OWNER]]));
  const pending = useRef(new Set<string>());
  const key = [...new Set(ids)].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    for (const id of key.split(",").filter(Boolean)) {
      if (users.has(id) || pending.current.has(id)) continue;
      pending.current.add(id);
      data
        .getUser(id)
        .then((u) => {
          if (cancelled || !u) return;
          setUsers((m) => (m.has(id) ? m : new Map(m).set(id, u)));
        })
        .catch(() => undefined)
        .finally(() => pending.current.delete(id));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return users;
}

export const useUser = (id: string | null): User | undefined => {
  const users = useUsers(id ? [id] : []);
  return id ? users.get(id) : undefined;
};

/** Everything the profile dashboard needs, live. */
export function useStats(user: User | null): { stats: Stats; logs: Live<LogEntry[]>; myPosts: Live<Post[]>; received: Live<Post[]> } {
  const uid = user?.id ?? null;
  const logs = useMyLogs(uid);
  const myPosts = useMyPosts(uid);
  const received = useReceivedPosts(uid);
  const stats = useMemo(() => computeStats(user, logs.data ?? [], myPosts.data ?? [], received.data ?? []), [user, logs.data, myPosts.data, received.data]);
  return { stats, logs, myPosts, received };
}
