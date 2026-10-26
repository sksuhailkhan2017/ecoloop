// POST /api/scan — Gemini identification, server-side so the key never reaches the browser.
// Body (JSON): { image: "data:image/jpeg;base64,...", hint?: string, mode?: "auto"|"item"|"receipt" }
// Header: Authorization: Bearer <Firebase ID token> (required when Firebase is configured).
// Response 200: { scanId, result, model } | { fallback: true, reason, message }
// Any failure to identify returns `fallback: true` so the UI uses the local rules matcher.
import { NextResponse, type NextRequest } from "next/server";

import { isAuthConfigured, verifyIdToken } from "@/lib/server/auth";
import { scan, type ScanMode } from "@/lib/server/gemini";
import { tokenBucket } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10; // Netlify function limit

/** Total budget for the Gemini call(s); the function must answer before Netlify's 10 s cut-off. */
const SCAN_BUDGET_MS = 8_000;
const MAX_IMAGE_BYTES = 2_500_000; // 768 px JPEGs are ~100–250 KB; this is a generous ceiling
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 10 scans, refilling one every minute, per uid (or IP in demo mode). */
const limiter = tokenBucket({ capacity: 10, refillPerMs: 1 / 60_000 });

const FALLBACK_MESSAGES: Record<string, string> = {
  not_configured: "The AI scanner isn't configured on this deployment yet.",
  quota: "The AI scanner is busy right now (free-tier quota).",
  timeout: "The AI scanner took too long.",
  unreadable: "The AI couldn't read that photo.",
  error: "The AI scanner hit an error.",
  rate_limited: "You're scanning very fast — give it a minute.",
};

function fallback(reason: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ fallback: true, reason, message: FALLBACK_MESSAGES[reason] ?? FALLBACK_MESSAGES.error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const started = Date.now();

  // ---- who is calling ----
  let key: string;
  if (isAuthConfigured) {
    let caller: Awaited<ReturnType<typeof verifyIdToken>>;
    try {
      caller = await verifyIdToken(req.headers.get("authorization"));
    } catch {
      return fallback("error", 503, { detail: "auth lookup unavailable" });
    }
    if (!caller) return NextResponse.json({ error: "Sign in to use the scanner." }, { status: 401 });
    key = `uid:${caller.uid}`;
  } else {
    key = `ip:${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim()}`;
  }
  const retryAfter = limiter.take(key);
  if (retryAfter !== null) return fallback("rate_limited", 429, { retryAfterSec: retryAfter });

  // ---- input ----
  let body: { image?: unknown; hint?: unknown; mode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send JSON with an `image` data URL." }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : "";
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(image);
  if (!m) return NextResponse.json({ error: "`image` must be a base64 data URL." }, { status: 400 });
  const mimeType = m[1].toLowerCase();
  const base64 = m[2];
  if (!ALLOWED_MIME.has(mimeType)) return NextResponse.json({ error: "Please upload a JPEG, PNG or WebP photo." }, { status: 415 });
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < 2_000) return NextResponse.json({ error: "That photo is too small to read. Try again with a clearer shot." }, { status: 400 });
  if (bytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "That photo is too large. Try again — the app normally downscales before sending." }, { status: 413 });
  const hint = typeof body.hint === "string" ? body.hint.slice(0, 120) : undefined;
  const mode: ScanMode = body.mode === "receipt" || body.mode === "item" ? body.mode : "auto";

  // ---- Gemini, within budget ----
  const outcome = await scan({ base64, mimeType }, { hint, mode, deadlineMs: started + SCAN_BUDGET_MS });
  if (!outcome.ok) {
    console.warn(`scan fallback (${outcome.reason}) after ${Date.now() - started} ms: ${outcome.detail}`);
    return fallback(outcome.reason);
  }
  return NextResponse.json({ scanId: crypto.randomUUID(), result: outcome.result, model: outcome.model, ms: Date.now() - started });
}
