import { Router } from "express";

import { requireAuth } from "../lib/auth";

/**
 * Demo-mode shared marketplace. Phones only had their own localStorage, so a post from one phone
 * never reached another. This keeps posts/claims/pickups in memory so every device sees the same
 * feed during a demo. Lost on restart (free tier sleeps after 15 min idle) — that's acceptable
 * for demo mode; Firestore replaces it in Phase 3.
 */
type RemoteUser = { id: string; name: string; handle: string; initials: string; avatarColor: string; neighbourhood: string; location: { lat: number; lng: number } };
type RemotePost = Record<string, unknown> & { id: string; ownerId: string; title: string; status: string };
type RemoteClaim = { postId: string; userId: string; createdAt: string };

const users = new Map<string, RemoteUser>();
const posts = new Map<string, RemotePost>();
const claims: RemoteClaim[] = [];
const MAX_POSTS = 200;

const isStr = (v: unknown, max = 200) => typeof v === "string" && v.length > 0 && v.length <= max;

function rememberUser(u: unknown) {
  if (!u || typeof u !== "object") return;
  const user = u as RemoteUser;
  if (isStr(user.id, 64) && isStr(user.name, 80)) users.set(user.id, user);
}

export const demoRouter = Router();
demoRouter.use(requireAuth);

// GET /api/demo/feed → everything another phone needs to merge
demoRouter.get("/feed", (_req, res) => {
  res.json({ users: [...users.values()], posts: [...posts.values()], claims });
});

// POST /api/demo/posts { post, owner }
demoRouter.post("/posts", (req, res) => {
  const { post, owner } = (req.body ?? {}) as { post?: RemotePost; owner?: RemoteUser };
  if (!post || !isStr(post.id, 64) || !isStr(post.ownerId, 64) || !isStr(post.title, 120)) {
    res.status(400).json({ error: "Invalid post" });
    return;
  }
  const photo = typeof post.photoURL === "string" ? post.photoURL : "";
  if (photo.length > 1_500_000) {
    res.status(413).json({ error: "Photo too large" });
    return;
  }
  rememberUser(owner);
  if (!posts.has(post.id) && posts.size >= MAX_POSTS) {
    const oldest = [...posts.keys()][0];
    posts.delete(oldest);
  }
  posts.set(post.id, post);
  res.json({ ok: true });
});

// POST /api/demo/claims { claim, user }
demoRouter.post("/claims", (req, res) => {
  const { claim, user } = (req.body ?? {}) as { claim?: RemoteClaim; user?: RemoteUser };
  if (!claim || !isStr(claim.postId, 64) || !isStr(claim.userId, 64)) {
    res.status(400).json({ error: "Invalid claim" });
    return;
  }
  rememberUser(user);
  if (!claims.some((c) => c.postId === claim.postId && c.userId === claim.userId)) {
    claims.push({ postId: claim.postId, userId: claim.userId, createdAt: isStr(claim.createdAt, 40) ? claim.createdAt : new Date().toISOString() });
  }
  res.json({ ok: true });
});

// POST /api/demo/pickups { postId, claimerId, pickupPhotoURL, pickedUpAt }
demoRouter.post("/pickups", (req, res) => {
  const { postId, claimerId, pickupPhotoURL, pickedUpAt } = (req.body ?? {}) as Record<string, unknown>;
  if (!isStr(postId, 64) || !isStr(claimerId, 64)) {
    res.status(400).json({ error: "Invalid pickup" });
    return;
  }
  const post = posts.get(postId as string);
  if (post) {
    posts.set(postId as string, {
      ...post,
      status: "picked_up",
      claimerId,
      pickupPhotoURL: typeof pickupPhotoURL === "string" && pickupPhotoURL.length <= 1_500_000 ? pickupPhotoURL : undefined,
      pickedUpAt: isStr(pickedUpAt, 40) ? pickedUpAt : new Date().toISOString(),
    });
  }
  res.json({ ok: true });
});
