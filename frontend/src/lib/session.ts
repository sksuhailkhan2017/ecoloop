// Small sessionStorage helpers for passing a scan to /scan/result and prefilling /posts/new.
import type { Category, ScanResult } from "./types";

export type StoredScan = {
  id: string;
  photoURL?: string;
  hint: string;
  result: ScanResult | null; // null → "help us identify" picker
  mode?: "item" | "receipt";
  createdAt: string;
};

export type PostPrefill = {
  title?: string;
  description?: string;
  category?: Category;
  photoURL?: string;
  fromScanId?: string;
};

const SCAN_KEY = "remarkham.scan";
const PREFILL_KEY = "remarkham.prefill";

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("sessionStorage write failed:", err);
  }
}

function remove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const getScan = () => read<StoredScan>(SCAN_KEY);
export const setScan = (scan: StoredScan) => write(SCAN_KEY, scan);
export const clearScan = () => remove(SCAN_KEY);

export const getPrefill = () => read<PostPrefill>(PREFILL_KEY);
export const setPrefill = (p: PostPrefill) => write(PREFILL_KEY, p);
export const clearPrefill = () => remove(PREFILL_KEY);
