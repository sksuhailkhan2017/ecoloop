// Static rewards catalog (fictional Markham businesses, docs/SPEC.md §9). Not stored in Firestore.
import { DEMO_REWARDS } from "./demo-data";
import type { Reward } from "./types";

export const REWARDS: Reward[] = DEMO_REWARDS();

export const rewardById = (id: string): Reward | undefined => REWARDS.find((r) => r.id === id);
