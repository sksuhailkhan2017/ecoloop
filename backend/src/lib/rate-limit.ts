import type { NextFunction, Request, Response } from "express";

/**
 * Tiny in-memory sliding-window limiter, keyed by uid (demo-user shares one bucket, so we also key
 * by IP). Protects the Gemini quota from one phone scanning in a loop. Resets on restart — fine for
 * a free-tier single instance. TODO: move to Firestore/Redis if the backend ever scales out.
 */
export function rateLimit({ windowMs, max, name }: { windowMs: number; max: number; name: string }) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.ip ?? "unknown").trim();
    const key = `${name}:${ip}`;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      const retryAfterSec = Math.ceil((windowMs - (now - recent[0])) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: `Slow down — ${max} scans per ${Math.round(windowMs / 60_000)} minutes. Try again in ${Math.ceil(retryAfterSec / 60)} min.`,
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    next();
  };
}
