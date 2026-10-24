import type { NextFunction, Request, Response } from "express";

import { adminAuth } from "./firebase.admin";

/** Request after `requireAuth` has run — `uid` always comes from the verified token. */
export type AuthedRequest = Request & { uid: string };

/** Uid used for every request when DEMO_MODE=true (no Firebase needed). Never enable in production. */
export const DEMO_UID = "demo-user";

const isDemoMode = () => process.env.DEMO_MODE === "true";

/**
 * Reads `Authorization: Bearer <Firebase ID token>`, verifies it with the Admin SDK and
 * attaches `req.uid`. Never trust a userId from the body or query (docs/SPEC.md §3).
 *
 * DEMO_MODE=true skips verification so the frontend (which currently signs in locally, without
 * Firebase) can call the backend, e.g. for Gemini scans. A real token is still honoured when sent.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token) {
    if (isDemoMode()) {
      (req as AuthedRequest).uid = DEMO_UID;
      next();
      return;
    }
    res.status(401).json({ error: "Missing Authorization: Bearer <idToken> header" });
    return;
  }

  let admin: ReturnType<typeof adminAuth>;
  try {
    admin = adminAuth();
  } catch (err) {
    // A missing/invalid service account is a server config problem, not a bad token. Reporting it
    // as 401 "Invalid or expired ID token" (as before) sends people debugging the wrong thing.
    console.error("Firebase Admin is not configured:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Server auth is not configured (check FIREBASE_SERVICE_ACCOUNT_BASE64)" });
    return;
  }

  try {
    const decoded = await admin.verifyIdToken(token);
    (req as AuthedRequest).uid = decoded.uid;
    next();
  } catch (err) {
    console.warn("verifyIdToken failed:", err instanceof Error ? err.message : err);
    res.status(401).json({ error: "Invalid or expired ID token" });
  }
}

export function uidOf(req: Request): string {
  const uid = (req as AuthedRequest).uid;
  if (!uid) throw new Error("uidOf() called on a request that did not pass requireAuth");
  return uid;
}
