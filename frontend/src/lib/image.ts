// Client-side image helpers: downscale captured/uploaded photos so they fit comfortably in
// localStorage (demo mode) and upload quickly (backend mode).

const MAX_EDGE = 1024;
const QUALITY = 0.82;

function drawScaled(source: CanvasImageSource, width: number, height: number, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function fileToDataUrl(file: File, maxEdge = MAX_EDGE, quality = QUALITY): Promise<string> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const out = drawScaled(bitmap, bitmap.width, bitmap.height, maxEdge, quality);
      bitmap.close();
      return out;
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image"));
      el.src = url;
    });
    return drawScaled(img, img.naturalWidth, img.naturalHeight, maxEdge, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function videoFrameToDataUrl(video: HTMLVideoElement, maxEdge = MAX_EDGE, quality = QUALITY): string {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  return drawScaled(video, w, h, maxEdge, quality);
}

/** Scan uploads are downscaled to this edge: plenty for Gemini, small enough to post in < 1 s. */
export const SCAN_MAX_EDGE = 768;

/** Re-encodes an existing data URL at a smaller size (used before sending a photo to /api/scan). */
export async function downscaleDataUrl(dataUrl: string, maxEdge = SCAN_MAX_EDGE, quality = 0.8): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read image"));
    el.src = dataUrl;
  });
  if (Math.max(img.naturalWidth, img.naturalHeight) <= maxEdge) return dataUrl;
  return drawScaled(img, img.naturalWidth, img.naturalHeight, maxEdge, quality);
}

export function isDataUrl(src: string): boolean {
  return src.startsWith("data:");
}
