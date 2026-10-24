// Calls the backend's Gemini scan (POST /api/scan). Off by default so the demo works with no backend:
// set NEXT_PUBLIC_USE_BACKEND_SCAN=true in frontend/.env.local once the backend is running.
import { api } from "./api";
import type { ScanResult } from "./types";

export type ScanMode = "auto" | "item" | "receipt";

export const BACKEND_SCAN_ENABLED = process.env.NEXT_PUBLIC_USE_BACKEND_SCAN === "true";

const TIMEOUT_MS = 45_000; // Gemini can take 10–20 s on a busy day

export async function scanWithBackend(
  photoDataUrl: string,
  hint: string,
  mode: ScanMode = "auto",
): Promise<{ scanId: string; result: ScanResult }> {
  const blob = await (await fetch(photoDataUrl)).blob();
  const form = new FormData();
  form.append("image", blob, "scan.jpg");
  form.append("mode", mode);
  if (hint.trim()) form.append("hint", hint.trim());

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await api<{ scanId: string; result: ScanResult }>("/api/scan", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}
