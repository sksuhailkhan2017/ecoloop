// Single source of truth for points, streaks, caps and anti-farming rules (docs/SPEC.md §5).
// Used by both data sources (Firestore and demo). firestore.rules mirrors what it can enforce.
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

// ---- anti-farming -----------------------------------------------------------------------------
// Handovers are the biggest lever (+25/+15), so they are the most constrained:
//   • both people must be signed in with Google (guest accounts are free to create, so a guest
//     could claim their own posts from throw-away accounts) — enforced by firestore.rules too;
//   • the same two people earn handover points at most once per PAIR_COOLDOWN_DAYS, either way;
//   • per-day and per-week ceilings on handover credits, as giver and as receiver;
//   • post points are capped per day. The item always changes hands; only points are withheld.

export const PAIR_COOLDOWN_DAYS = 30;
export const MAX_PICKUP_POINTS_PER_DAY = 3; // as giver
export const MAX_RECEIVE_POINTS_PER_DAY = 3; // as receiver
export const MAX_HANDOVER_POINTS_PER_WEEK = 5; // giver + receiver combined, rolling 7 days
export const MAX_POST_POINTS_PER_DAY = 3;
export const LINKED_ACCOUNTS_MESSAGE = "Handover points need both of you signed in with Google — the item still changes hands.";

type PriorHandover = { id: string; ownerId: string; claimerId?: string; pickedUpAt?: string };
type HandoverEntry = { reason: PointsReason; createdAt: string };

function handoversThisWeek(entries: HandoverEntry[], now: Date): number {
  const since = now.getTime() - 7 * 86_400_000;
  return entries.filter((e) => (e.reason === "pickup_giver" || e.reason === "pickup_receiver") && new Date(e.createdAt).getTime() > since).length;
}

/** Why the giver should NOT earn points for this handover, or undefined when they should. */
export function giverHandoverLimit(ctx: {
  ownerIsGuest: boolean;
  claimerIsGuest: boolean;
  /** picked_up posts involving me (as owner or claimer) */
  priorHandovers: PriorHandover[];
  /** my pickup_giver + pickup_receiver ledger entries */
  myHandoverLedger: HandoverEntry[];
  me: string;
  claimerId: string;
  postId: string;
  now?: Date;
}): string | undefined {
  const now = ctx.now ?? new Date();
  if (ctx.ownerIsGuest || ctx.claimerIsGuest) return LINKED_ACCOUNTS_MESSAGE;
  const since = now.getTime() - PAIR_COOLDOWN_DAYS * 86_400_000;
  const samePair = ctx.priorHandovers.some(
    (p) =>
      p.id !== ctx.postId &&
      !!p.pickedUpAt &&
      new Date(p.pickedUpAt).getTime() > since &&
      ((p.ownerId === ctx.me && p.claimerId === ctx.claimerId) || (p.ownerId === ctx.claimerId && p.claimerId === ctx.me)),
  );
  if (samePair) return `You two already traded in the last ${PAIR_COOLDOWN_DAYS} days — no points this time.`;
  const today = todayInToronto(now);
  const giverToday = ctx.myHandoverLedger.filter((e) => e.reason === "pickup_giver" && todayInToronto(new Date(e.createdAt)) === today).length;
  if (giverToday >= MAX_PICKUP_POINTS_PER_DAY) return `Daily limit: points for ${MAX_PICKUP_POINTS_PER_DAY} handovers a day.`;
  if (handoversThisWeek(ctx.myHandoverLedger, now) >= MAX_HANDOVER_POINTS_PER_WEEK) return `Weekly limit: points for ${MAX_HANDOVER_POINTS_PER_WEEK} handovers a week.`;
  return undefined;
}

/** Why the receiver should NOT be credited for a pickup, or undefined when they should. */
export function receiverHandoverLimit(myHandoverLedger: HandoverEntry[], now: Date = new Date()): string | undefined {
  const today = todayInToronto(now);
  const receivedToday = myHandoverLedger.filter((e) => e.reason === "pickup_receiver" && todayInToronto(new Date(e.createdAt)) === today).length;
  if (receivedToday >= MAX_RECEIVE_POINTS_PER_DAY) return `Daily limit: points for ${MAX_RECEIVE_POINTS_PER_DAY} pickups a day.`;
  if (handoversThisWeek(myHandoverLedger, now) >= MAX_HANDOVER_POINTS_PER_WEEK) return `Weekly limit: points for ${MAX_HANDOVER_POINTS_PER_WEEK} handovers a week.`;
  return undefined;
}

/** Post points: +5 for the first MAX_POST_POINTS_PER_DAY posts a day, then 0 (the post still goes live). */
export function postPointsFor(postLedger: HandoverEntry[], now: Date = new Date()): number {
  const today = todayInToronto(now);
  const postsToday = postLedger.filter((e) => e.reason === "post_created" && todayInToronto(new Date(e.createdAt)) === today).length;
  return postsToday < MAX_POST_POINTS_PER_DAY ? POINTS.post_created : 0;
}
