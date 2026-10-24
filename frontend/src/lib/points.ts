// Client-side copy of backend/src/lib/points.ts for demo mode. Keep the two in sync.
import type { PointsReason, Stream } from "./types";

export const POINTS = {
  log_diverted: 5,
  log_garbage: 1,
  post_created: 5,
  pickup_giver: 25,
  pickup_receiver: 15,
  streak_7: 20,
} as const;

export const STREAK_BONUS_EVERY = 7;
/** Anti-farming: points from logging scans are capped per day (logs still count toward stats). */
export const MAX_LOG_POINTS_PER_DAY = 50;
export const MARKHAM_DIVERSION_TARGET = 0.8;
export const TIMEZONE = "America/Toronto";

export function isDiverted(stream: Stream): boolean {
  return stream !== "garbage";
}

export function pointsForLog(stream: Stream): { delta: number; reason: PointsReason } {
  return isDiverted(stream)
    ? { delta: POINTS.log_diverted, reason: "log_diverted" }
    : { delta: POINTS.log_garbage, reason: "log_garbage" };
}

export function todayInToronto(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function nextStreak(
  lastActiveDate: string | undefined,
  streakCount: number,
  today: string = todayInToronto(),
): { streakCount: number; lastActiveDate: string; changed: boolean; bonus: boolean } {
  if (lastActiveDate === today) {
    return { streakCount, lastActiveDate: today, changed: false, bonus: false };
  }
  const next = lastActiveDate === addDays(today, -1) ? streakCount + 1 : 1;
  return {
    streakCount: next,
    lastActiveDate: today,
    changed: true,
    bonus: next > 0 && next % STREAK_BONUS_EVERY === 0,
  };
}
