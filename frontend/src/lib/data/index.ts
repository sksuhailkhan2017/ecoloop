import { isFirebaseConfigured } from "../firebase.client";
import { firestoreSource } from "./firestore";
import { localSource } from "./local";
import type { DataSource } from "./source";

/** The one data source the app talks to. Firestore in production, localStorage in demo mode. */
export const data: DataSource = isFirebaseConfigured ? firestoreSource : localSource;

export type { CreatePostResult, DataSource, LogResult, NewPostInput, PickupResult } from "./source";
