// Client side of POST /api/scan (src/app/api/scan/route.ts). The scan page falls back to
// lib/scan-mock when this returns { fallback: true } or throws (offline, timeout, signed out).
// Results are cached in sessionStorage by image hash + hint so re-scanning the same photo is free.
import { getFirebaseAuth } from "./firebase.client";
import type { ScanResult } from "./types";

export type ScanMode = "auto" | "item" | "receipt";

export class ScanApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ScanApiError";
  }
}

export type ScanHit = { scanId: string; result: ScanResult; cached?: boolean };
export type ScanFallback = { fallback: true; reason: string; message: string };
export type ScanApiResponse = ScanHit | ScanFallback;

const CACHE_PREFIX = "ecoloop.scan.cache:";
const CACHE_MAX = 12;

async function hashKey(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch {
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
    return `h${h}`;
  }
}

function readCache(key: string): ScanHit | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as ScanHit) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, hit: ScanHit) {
  try {
    const keys = Object.keys(window.sessionStorage).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length >= CACHE_MAX) window.sessionStorage.removeItem(keys[0]);
    window.sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(hit));
  } catch {
    /* quota or private mode: caching is best-effort */
  }
}

/**
 * Sends a (768 px) data URL to the scan route. Resolves with a result, a cached result, or a
 * fallback marker; rejects with ScanApiError for network/auth problems.
 */
export async function scanWithApi(photoDataUrl: string, hint: string, mode: ScanMode = "auto", { timeoutMs = 12_000 }: { timeoutMs?: number } = {}): Promise<ScanApiResponse> {
  const key = await hashKey(`${photoDataUrl}|${hint.trim().toLowerCase()}|${mode}`);
  const hit = readCache(key);
  if (hit) return { ...hit, cached: true };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const user = getFirebaseAuth()?.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers,
      body: JSON.stringify({ image: photoDataUrl, hint: hint.trim() || undefined, mode }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as Partial<ScanHit & ScanFallback & { error?: string }>;
    if (body.fallback) return { fallback: true, reason: body.reason ?? "error", message: body.message ?? "The AI scanner isn't available right now." };
    if (!res.ok || !body.result || !body.scanId) throw new ScanApiError(res.status, body.error ?? `Scan failed (${res.status})`);
    const out = { scanId: body.scanId, result: body.result };
    writeCache(key, out);
    return out;
  } catch (err) {
    if (err instanceof ScanApiError) throw err;
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    throw new ScanApiError(0, timedOut ? "The scanner took too long." : "Couldn't reach the scanner.");
  } finally {
    window.clearTimeout(timer);
  }
}
