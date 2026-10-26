// Two static "Sample listing" cards so a brand-new deployment never shows an empty feed.
// Clearly badged as samples; they cannot be claimed and are never written to Firestore.
import { PHOTOS } from "./demo-data";
import type { Post, User } from "./types";

export const SAMPLE_OWNER: User = {
  id: "sample-owner",
  name: "EcoLoop Demo",
  handle: "ecoloopdemo",
  initials: "ED",
  avatarColor: "bg-stone-400",
  neighbourhood: "Unionville",
  points: 0,
  streakCount: 0,
  location: { lat: 43.8656, lng: -79.3107 },
  joinedAt: "2026-10-01T12:00:00.000Z",
  isDemo: true,
};

export const SAMPLE_POSTS: Post[] = [
  {
    id: "sample-chair",
    ownerId: SAMPLE_OWNER.id,
    title: "Oak dining chair (sample)",
    description:
      "This is a sample listing so you can see how EcoLoop works. Real neighbours' items appear here as soon as someone posts one — tap the + button to be the first.",
    category: "furniture",
    condition: "good",
    photoURL: PHOTOS.stool,
    location: { lat: 43.8656, lng: -79.3107 },
    neighbourhood: "Unionville",
    status: "open",
    claimCount: 0,
    createdAt: "2026-10-20T15:00:00.000Z",
    isSample: true,
  },
  {
    id: "sample-jacket",
    ownerId: SAMPLE_OWNER.id,
    title: "Kids' winter jacket, size 6 (sample)",
    description:
      "Sample listing. Posting is free: add a photo, a title and a category, and neighbours nearby can tap “I want this”. When you hand it over and snap a photo, you both earn points.",
    category: "clothing",
    condition: "like_new",
    photoURL: PHOTOS.coat,
    location: { lat: 43.8777, lng: -79.2628 },
    neighbourhood: "Markham Village",
    status: "open",
    claimCount: 0,
    createdAt: "2026-10-21T18:30:00.000Z",
    isSample: true,
  },
];

export const isSampleId = (id: string) => SAMPLE_POSTS.some((p) => p.id === id);
export const samplePost = (id: string) => SAMPLE_POSTS.find((p) => p.id === id);
