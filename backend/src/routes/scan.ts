import { randomUUID } from "node:crypto";

import { Router } from "express";
import multer from "multer";

import { requireAuth, uidOf } from "../lib/auth";
import { db } from "../lib/firebase.admin";
import { ScanError, scan, type ScanMode } from "../lib/gemini";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export const scanRouter = Router();

// POST /api/scan  — multipart: image (required), hint (optional), mode ("auto" | "item" | "receipt", default "auto")
// → calls lib/gemini.scan(), saves scans/{id} when Firebase is configured, returns { scanId, result }
scanRouter.post("/", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Attach a photo in the `image` field." });
      return;
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      res.status(415).json({ error: "Please upload a JPEG, PNG or WebP photo." });
      return;
    }

    const requested = req.body?.mode;
    const mode: ScanMode = requested === "receipt" || requested === "item" ? requested : "auto";
    const hint = typeof req.body?.hint === "string" ? req.body.hint : undefined;

    const result = await scan({ base64: file.buffer.toString("base64"), mimeType: file.mimetype }, hint, mode);
    const scanId = randomUUID();

    // Persisting is best-effort: a Firestore outage (or running without Firebase in DEMO_MODE) must
    // not make a successful scan look like a failure.
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      try {
        await db()
          .collection("scans")
          .doc(scanId)
          .set({ userId: uidOf(req), mode, result, createdAt: new Date().toISOString() });
      } catch (err) {
        console.warn("Could not save scan:", err instanceof Error ? err.message : err);
      }
    }

    res.json({ scanId, result });
  } catch (err) {
    if (err instanceof ScanError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof Error && /GEMINI_API_KEY/.test(err.message)) {
      res.status(500).json({ error: "The scanner isn't configured yet (missing GEMINI_API_KEY)." });
      return;
    }
    next(err);
  }
});
