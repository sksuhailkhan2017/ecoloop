// Server-only: in-memory token bucket per key (uid, or IP in demo mode). Protects the Gemini free
// quota from one client scanning in a loop. State lives per function instance and resets on cold
// start — good enough for a hackathon; a shared store (Firestore/Upstash) is the production path.

type Bucket = { tokens: number; updated: number };

export function tokenBucket({ capacity, refillPerMs }: { capacity: number; refillPerMs: number }) {
  const buckets = new Map<string, Bucket>();
  return {
    /** Returns null when allowed, else the number of seconds until the next token. */
    take(key: string): number | null {
      const now = Date.now();
      const b = buckets.get(key) ?? { tokens: capacity, updated: now };
      b.tokens = Math.min(capacity, b.tokens + (now - b.updated) * refillPerMs);
      b.updated = now;
      if (b.tokens >= 1) {
        b.tokens -= 1;
        buckets.set(key, b);
        return null;
      }
      buckets.set(key, b);
      if (buckets.size > 5_000) for (const [k, v] of buckets) if (v.tokens >= capacity) buckets.delete(k);
      return Math.ceil((1 - b.tokens) / refillPerMs / 1000);
    },
  };
}
