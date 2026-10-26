// Dashboard numbers (docs/SPEC.md §5), computed on the client from the user's own logs and posts.
import { MARKHAM_DIVERSION_TARGET } from "./points";
import type { LogEntry, Post, Stream, User } from "./types";

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

export function computeStats(user: User | null, logs: LogEntry[], myPosts: Post[], received: Post[]): Stats {
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
    itemsGiven: myPosts.filter((p) => p.status === "picked_up").length,
    itemsReceived: received.length,
    byStream,
    points: user?.points ?? 0,
    streakCount: user?.streakCount ?? 0,
  };
}
