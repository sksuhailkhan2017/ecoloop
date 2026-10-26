// Photo uploads. Production: Cloudinary unsigned upload preset (Firebase Storage needs the paid
// Blaze plan on new projects). Demo mode: the compressed data URL is kept as-is in localStorage.
// Only the returned https URL is ever stored in Firestore.
import { isFirebaseConfigured } from "./firebase.client";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const UPLOAD_TIMEOUT_MS = 30_000;

export const isUploadConfigured = Boolean(CLOUD_NAME && UPLOAD_PRESET);

export class UploadNotConfiguredError extends Error {
  constructor() {
    super("Photo uploads aren't configured yet (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / _UPLOAD_PRESET).");
    this.name = "UploadNotConfiguredError";
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Uploads a (already downscaled) JPEG data URL. Resolves to a public https URL.
 * `onProgress` receives 0–1. Rejects with UploadNotConfiguredError when Cloudinary isn't set up.
 */
export async function uploadPhoto(dataUrl: string, folder: "posts" | "pickups", onProgress?: (fraction: number) => void): Promise<string> {
  if (!isFirebaseConfigured) {
    onProgress?.(1);
    return dataUrl; // demo mode: stays in this browser
  }
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new UploadNotConfiguredError();

  const blob = await dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("tags", `ecoloop,${folder}`); // the preset sets the asset folder; tags keep posts/pickups distinguishable

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { secure_url?: string; error?: { message?: string } };
        if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
          onProgress?.(1);
          resolve(body.secure_url);
        } else {
          reject(new Error(body.error?.message ?? `Upload failed (${xhr.status}).`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller photo or a better connection."));
    xhr.send(form);
  });
}

const CLOUDINARY_UPLOAD_RE = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(.+)$/;

export const isCloudinaryUrl = (src: string) => CLOUDINARY_UPLOAD_RE.test(src);

/** next/image loader: lets Cloudinary resize + auto-format instead of the Netlify image CDN. */
export function cloudinaryLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const m = CLOUDINARY_UPLOAD_RE.exec(src);
  if (!m) return src;
  const q = quality ? `q_${quality}` : "q_auto";
  return `https://res.cloudinary.com/${m[1]}/image/upload/f_auto,${q},c_limit,w_${width}/${m[2]}`;
}
