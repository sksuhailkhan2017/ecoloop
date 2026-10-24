// Demo-mode cross-device sync. Mirrors posts / claims / pickups to the backend's in-memory feed
// (backend/src/routes/demo.ts) so a listing from one phone shows up on another. Every call is
// best-effort: if the backend is asleep or offline the app keeps working from localStorage.
import { API_URL } from "./api";
import type { Claim, LatLng, Post, User } from "./types";

export const SYNC_ENABLED = process.env.NEXT_PUBLIC_USE_BACKEND_SCAN === "true";

export type RemoteUser = Pick<User, "id" | "name" | "handle" | "initials" | "avatarColor" | "neighbourhood"> & { location: LatLng };
export type RemoteFeed = { users: RemoteUser[]; posts: Post[]; claims: Claim[] };

export const toRemoteUser = (u: User): RemoteUser => ({
  id: u.id,
  name: u.name,
  handle: u.handle,
  initials: u.initials,
  avatarColor: u.avatarColor,
  neighbourhood: u.neighbourhood,
  location: u.location,
});

async function post(path: string, body: unknown): Promise<void> {
  if (!SYNC_ENABLED) return;
  try {
    await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (err) {
    console.warn("demo sync failed:", path, err);
  }
}

export const pushPost = (p: Post, owner: User) => post("/api/demo/posts", { post: p, owner: toRemoteUser(owner) });
export const pushClaim = (claim: Claim, user: User) => post("/api/demo/claims", { claim, user: toRemoteUser(user) });
export const pushPickup = (p: Post) =>
  post("/api/demo/pickups", { postId: p.id, claimerId: p.claimerId, pickupPhotoURL: p.pickupPhotoURL, pickedUpAt: p.pickedUpAt });

export async function fetchFeed(): Promise<RemoteFeed | null> {
  if (!SYNC_ENABLED) return null;
  try {
    const res = await fetch(`${API_URL}/api/demo/feed`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as RemoteFeed;
  } catch {
    return null;
  }
}
