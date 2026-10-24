// Shared domain types. Mirror of docs/SPEC.md §4 and §6.
// The frontend keeps its own copy in frontend/src/lib/types.ts — keep them in sync.

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

export const CONDITIONS = ["like_new", "good", "fair"] as const;
export type Condition = (typeof CONDITIONS)[number];

export type PostStatus = "open" | "picked_up";

export type LatLng = { lat: number; lng: number };

export type ScanItem = {
  name: string;
  productName?: string; // brand-level name read from the label, e.g. "Dasani 500 mL plastic water bottle"
  sustainabilityScore?: number; // 0–100 for the best way to deal with it (display only; points stay rule-based)
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
};

export type PointsReason =
  | "log_diverted"
  | "log_garbage"
  | "post_created"
  | "pickup_giver"
  | "pickup_receiver"
  | "streak_7"
  | "redeem";
