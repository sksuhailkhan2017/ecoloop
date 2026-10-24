// Sends a captured photo to the backend's Gemini scan (POST /api/scan). The scan page falls back to
// lib/scan-mock when this throws (backend asleep, out of quota, offline).
import { API_URL, ApiError } from "./api";
import type { ScanResult } from "./types";

export type ScanMode = "auto" | "item" | "receipt";

export const BACKEND_SCAN_ENABLED = process.env.NEXT_PUBLIC_USE_BACKEND_SCAN === "true";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function scanWithBackend(
  photoDataUrl: string,
  hint: string,
  mode: ScanMode = "auto",
  { timeoutMs = 95_000 }: { timeoutMs?: number } = {},
): Promise<{ scanId: string; result: ScanResult }> {
  const blob = await dataUrlToBlob(photoDataUrl);
  const form = new FormData();
  form.append("image", blob, "scan.jpg");
  form.append("mode", mode);
  if (hint.trim()) form.append("hint", hint.trim());

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api/scan`, { method: "POST", body: form, signal: ctrl.signal });
    const body = (await res.json().catch(() => ({}))) as { error?: string; scanId?: string; result?: ScanResult };
    if (!res.ok || !body.result) throw new ApiError(res.status, body.error ?? `Scan failed (${res.status})`);
    return { scanId: body.scanId ?? crypto.randomUUID(), result: body.result };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError(0, timedOut ? "The scanner took too long." : "Couldn't reach the scanner.");
  } finally {
    window.clearTimeout(timer);
  }
}

/** Fire-and-forget: wakes a sleeping free-tier backend so the first real scan is fast. */
export function warmBackend() {
  if (!BACKEND_SCAN_ENABLED) return;
  fetch(`${API_URL}/api/health`, { cache: "no-store" }).catch(() => undefined);
}
