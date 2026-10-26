// Shared domain types for the frontend. Mirrors backend/src/types.ts (keep in sync) and
// docs/SPEC.md §4 / §6, plus the demo-mode shapes used by lib/store.tsx.

export const STREAMS = [
  "blue_box",
  "green_bin",
  "garbage",
  "textile_bin",
  "recycling_depot",
  "hazardous_depot",
  "yard_waste",
  "bulky_pickup",
  "retailer_takeback",
] as const;
export type Stream = (typeof STREAMS)[number];

export const CATEGORIES = ["furniture", "clothing", "electronics", "kitchen", "kids", "books", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; emoji: string; gradient: string }> = {
  furniture: { label: "Furniture", emoji: "🪑", gradient: "from-amber-100 to-orange-200" },
  clothing: { label: "Clothing", emoji: "🧥", gradient: "from-violet-100 to-fuchsia-200" },
  electronics: { label: "Electronics", emoji: "🔌", gradient: "from-sky-100 to-indigo-200" },
  kitchen: { label: "Kitchen", emoji: "🍳", gradient: "from-rose-100 to-red-200" },
  kids: { label: "Kids", emoji: "🧸", gradient: "from-yellow-100 to-lime-200" },
  books: { label: "Books", emoji: "📚", gradient: "from-teal-100 to-emerald-200" },
  other: { label: "Other", emoji: "📦", gradient: "from-stone-100 to-stone-300" },
};

export const CONDITIONS = ["like_new", "good", "fair"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_META: Record<Condition, { label: string }> = {
  like_new: { label: "Like new" },
  good: { label: "Good" },
  fair: { label: "Fair" },
};

export type PostStatus = "open" | "picked_up";

export type LatLng = { lat: number; lng: number };

export type ScanItem = {
  name: string;
  productName?: string; // label-level name read by Gemini, e.g. "Dasani 500 mL plastic water bottle"
  sustainabilityScore?: number; // 0–100, display only
  material: string;
  stream: Stream;
  binLabel: string;
  instructions: string;
  reusable: boolean;
  reuseSuggestion?: string;
  estWeightG: number;
  confidence: number; // 0–1
};

export type ScanResult = {
  kind?: "item" | "receipt"; // what the photo turned out to be
  summary: string;
  items: ScanItem[];
  overallReusable: boolean;
};

export type DisposalRule = {
  item: string;
  aliases: string[];
  stream: Stream;
  instructions: string;
  reusable: boolean;
  reuse_suggestion?: string;
  est_weight_g: number;
  /** False until a human checked the entry against markham.ca "What Goes Where". */
  verified?: boolean;
};

export type PointsReason =
  | "log_diverted"
  | "log_garbage"
  | "post_created"
  | "pickup_giver"
  | "pickup_receiver"
  | "streak_7"
  | "redeem";

export type User = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  avatarColor: string; // tailwind bg class, e.g. "bg-emerald-500"
  photoURL?: string;
  neighbourhood: string;
  bio?: string;
  points: number;
  streakCount: number;
  lastActiveDate?: string; // YYYY-MM-DD America/Toronto
  location: LatLng;
  /** How `location` was obtained. Unset = never asked (login shows the location step). */
  locationSource?: LocationSource;
  joinedAt: string;
  /** Anonymous Firebase account ("Continue as guest"). */
  isGuest?: boolean;
  /** When the first-login walkthrough was completed or skipped. */
  onboardedAt?: string;
  /** Seeded demo profile (demo mode only, never in Firestore). */
  isDemo?: boolean;
};

export type LocationSource = "gps" | "picked" | "default";

export type Post = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  category: Category;
  condition: Condition;
  photoURL: string;
  location: LatLng;
  neighbourhood: string;
  status: PostStatus;
  /** Denormalised number of claims (non-owners may bump it by exactly 1 — see firestore.rules). */
  claimCount?: number;
  claimerId?: string;
  pickupPhotoURL?: string;
  pickedUpAt?: string;
  /** Set by the owner on pickup: false when anti-collusion withheld points for this handover. */
  pointsAwarded?: boolean;
  fromScanId?: string;
  createdAt: string;
  /** Static "Sample listing" shown to first visitors (never stored in Firestore). */
  isSample?: boolean;
};

export type Claim = {
  postId: string;
  userId: string;
  createdAt: string;
};

export type LogEntry = {
  id: string;
  userId: string;
  scanId?: string;
  itemName: string;
  stream: Stream;
  binLabel: string;
  estWeightG: number;
  diverted: boolean;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  userId: string;
  delta: number;
  reason: PointsReason;
  refId?: string;
  createdAt: string;
};

export type Reward = {
  id: string;
  businessName: string;
  title: string;
  description: string;
  cost: number;
  address: string;
  emoji: string;
};

export type Redemption = {
  id: string;
  userId: string;
  rewardId: string;
  code: string;
  createdAt: string;
};

/** Per-stream presentation: pill colours (docs/SPEC.md §8), chart colour, depot link flag. */
export const STREAM_META: Record<
  Stream,
  { label: string; short: string; emoji: string; pill: string; dot: string; bar: string; isDepot: boolean }
> = {
  blue_box: {
    label: "Blue Box",
    short: "Blue Box",
    emoji: "🟦",
    pill: "bg-sky-100 text-sky-900 ring-sky-200",
    dot: "bg-sky-500",
    bar: "#0284c7",
    isDepot: false,
  },
  green_bin: {
    label: "Green Bin",
    short: "Green Bin",
    emoji: "🟩",
    pill: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    dot: "bg-emerald-500",
    bar: "#059669",
    isDepot: false,
  },
  garbage: {
    label: "Garbage",
    short: "Garbage",
    emoji: "🗑️",
    pill: "bg-stone-200 text-stone-800 ring-stone-300",
    dot: "bg-stone-500",
    bar: "#78716c",
    isDepot: false,
  },
  textile_bin: {
    label: "Textile Bin",
    short: "Textiles",
    emoji: "🟪",
    pill: "bg-violet-100 text-violet-900 ring-violet-200",
    dot: "bg-violet-500",
    bar: "#7c3aed",
    isDepot: false,
  },
  recycling_depot: {
    label: "Recycling Depot",
    short: "Depot",
    emoji: "🏭",
    pill: "bg-orange-100 text-orange-900 ring-orange-200",
    dot: "bg-orange-500",
    bar: "#ea580c",
    isDepot: true,
  },
  hazardous_depot: {
    label: "Hazardous Waste Depot",
    short: "Hazardous",
    emoji: "⚠️",
    pill: "bg-orange-100 text-orange-900 ring-orange-200",
    dot: "bg-orange-600",
    bar: "#c2410c",
    isDepot: true,
  },
  yard_waste: {
    label: "Yard Waste",
    short: "Yard Waste",
    emoji: "🍂",
    pill: "bg-lime-100 text-lime-900 ring-lime-200",
    dot: "bg-lime-500",
    bar: "#65a30d",
    isDepot: false,
  },
  bulky_pickup: {
    label: "Bulky Item Pickup",
    short: "Bulky",
    emoji: "🛋️",
    pill: "bg-amber-100 text-amber-900 ring-amber-200",
    dot: "bg-amber-500",
    bar: "#d97706",
    isDepot: false,
  },
  retailer_takeback: {
    label: "Retailer Take-back",
    short: "Retailer",
    emoji: "🏪",
    pill: "bg-orange-100 text-orange-900 ring-orange-200",
    dot: "bg-orange-400",
    bar: "#f97316",
    isDepot: false,
  },
};
