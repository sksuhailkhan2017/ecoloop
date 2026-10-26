// Server-only: identify the caller of an API route from their Firebase ID token without the
// Admin SDK (which would need a service account). Firebase's Identity Toolkit REST endpoint
// validates the token for us using the project's public web API key.

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const LOOKUP_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 5 * 60_000;

export const isAuthConfigured = Boolean(API_KEY);

const cache = new Map<string, { uid: string; isAnonymous: boolean; until: number }>();

export type Caller = { uid: string; isAnonymous: boolean };

/** Resolves the caller, or null when the token is missing/invalid. Throws only on network failure. */
export async function verifyIdToken(authorization: string | null): Promise<Caller | null> {
  if (!API_KEY) return null;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return { uid: hit.uid, isAnonymous: hit.isAnonymous };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null; // 400 INVALID_ID_TOKEN / expired
    const body = (await res.json()) as { users?: Array<{ localId: string; providerUserInfo?: unknown[] }> };
    const u = body.users?.[0];
    if (!u?.localId) return null;
    const caller = { uid: u.localId, isAnonymous: !(u.providerUserInfo && u.providerUserInfo.length > 0) };
    if (cache.size > 2_000) cache.clear();
    cache.set(token, { ...caller, until: Date.now() + CACHE_TTL_MS });
    return caller;
  } finally {
    clearTimeout(timer);
  }
}
