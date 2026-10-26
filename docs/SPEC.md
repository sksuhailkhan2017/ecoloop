# EcoLoop — Build Spec & Agent Prompt

> **Instructions to the coding agent:** You are building a complete, deployable web app for a 24-hour civic-tech hackathon (GDG Markham, waste-reduction track). Read this whole file first, then build it **phase by phase in the order in Section 10**. Working beats perfect. After each phase, run the app and confirm that phase's acceptance checks before moving on. Do not stop to ask clarifying questions — make a reasonable choice, leave a `// TODO:` comment, and keep going. Mobile-first: everything must look right at 390px width.

> **Repo-layout note:** this spec was written before the build. The shipped app is a single Next.js app in `frontend/` (the Express backend was removed after the hackathon); see **§13 What changed after the hackathon** and the root `README.md` for what actually runs.

---

## 1. What this is

**EcoLoop** is "Instagram for reducing waste" in Markham, Ontario.

Three bottom tabs, like Instagram:

1. **Feed (Marketplace)** — the home screen. A location-sorted feed of items nearby that residents are giving away for free (clothes, a chair, a lamp). Anyone can post with a photo; anyone can tap **"I want this."**
2. **Scan** — point the camera at any item. Gemini identifies it and tells you **which Markham bin or depot it belongs in**, with instructions. Then it asks: **Log it** (I'm disposing of it) or **Post to Marketplace** (someone else could use it).
3. **Profile** — points balance, streak, a diversion dashboard, my listings, my logged items, and a **Rewards** page where points are redeemed at local Markham businesses.

**The core loop:** scan → log or post → earn points → redeem locally. When a giver confirms a pickup with a photo, **both giver and receiver earn points**.

---

## 2. Stack (do not change)

- **Next.js 15 (App Router, TypeScript)** — frontend
- **Tailwind CSS** — mobile-first, bottom tab bar, card UI
- **Firebase**: Auth (Google sign-in + anonymous fallback), Firestore (data), Storage (photos)
- **Firebase Admin SDK** in the backend for all writes (points must never be writable from the client)
- **Google Gemini API** (`@google/genai`) — model from env `GEMINI_MODEL`, default `gemini-2.5-flash`
- **recharts** for the one dashboard chart
- Deploy target: **Vercel** (frontend) + any Node host for the backend. Must run with `npm run dev` locally.

Camera: use `<input type="file" accept="image/*" capture="environment">`. No native app, no PWA service worker.

---

## 3. Project setup

See root `README.md` for the actual commands in this repo.

**Env vars** (document them in `README.md`):

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_BASE64=   # base64 of the service-account JSON
NEXT_PUBLIC_DEFAULT_LAT=43.8561    # Markham Civic Centre fallback
NEXT_PUBLIC_DEFAULT_LNG=-79.3370
```

**Frontend folder layout (`frontend/src`):**

```
app/
  (tabs)/feed/page.tsx        # home
  (tabs)/scan/page.tsx
  (tabs)/profile/page.tsx
  posts/[id]/page.tsx         # post detail + claim + pickup confirm
  posts/new/page.tsx          # create post (prefilled from scan via query/sessionStorage)
  scan/result/page.tsx        # scan result + Log / Post CTAs
  rewards/page.tsx
  login/page.tsx
components/                   # BottomNav, PostCard, ScanResultCard, StatCard, PointsBadge, etc.
lib/
  firebase.client.ts
  api.ts                      # fetch wrapper: attaches Firebase ID token, talks to backend
```

**Backend folder layout (`backend/src`):**

```
index.ts                      # Express app
lib/
  firebase.admin.ts
  gemini.ts                   # scan() — builds prompt, calls Gemini, validates JSON
  points.ts                   # all point/streak rules in one place
  geo.ts                      # haversine, distance formatting
  auth.ts                     # verifyIdToken middleware
routes/                       # see Section 7
scripts/seed.ts               # npm run seed
```

**Shared data (`data/`):**

```
markham_rules.json            # disposal knowledge base (Section 6)
depots.json
seed/posts.json
seed/rewards.json
```

All API routes read the Firebase ID token from `Authorization: Bearer <token>`, verify it with Admin, and use `uid` from the token. Never trust a `userId` in the request body.

---

## 4. Data model (Firestore)

```ts
users/{uid}
  displayName, photoURL, points: number, streakCount: number,
  lastActiveDate: "YYYY-MM-DD" (America/Toronto), location: {lat, lng},
  createdAt

posts/{id}
  ownerId, title, description, category: "furniture"|"clothing"|"electronics"|"kitchen"|"kids"|"books"|"other",
  condition: "like_new"|"good"|"fair", photoURL, location: {lat, lng},
  status: "open"|"picked_up", claimCount: number,
  claimerId?: string, pickupPhotoURL?: string, pickedUpAt?,
  fromScanId?: string, createdAt

posts/{id}/claims/{uid}
  userId, displayName, photoURL, createdAt

scans/{id}
  userId, photoURL?, result: ScanResult (Section 6), createdAt

logs/{id}                       # tracker events
  userId, scanId, itemName, stream, estWeightG, diverted: boolean, createdAt

rewards/{id}                    # seeded
  businessName, title, description, cost: number, address, emoji

redemptions/{id}
  userId, rewardId, code: string (6 chars, uppercase), createdAt

pointsLedger/{id}
  userId, delta, reason: "log_diverted"|"log_garbage"|"post_created"|"pickup_giver"|"pickup_receiver"|"streak_7"|"redeem",
  refId, createdAt
```

Write `users.points` and the ledger in the **same Firestore transaction** every time.

---

## 5. Points, streaks, stats — single source of truth: `backend/src/lib/points.ts`

| Action | Points |
|---|---|
| Log a scanned item, non-garbage stream (diverted) | +5 |
| Log a scanned item, garbage | +1 |
| Create a marketplace post | +5 |
| Pickup confirmed — giver (post owner) | +25 |
| Pickup confirmed — receiver (claimer) | +15 |
| Reach a 7-day streak | +20 (once per 7) |
| Redeem a reward | −cost |

**Streak:** on any log or post, compare `lastActiveDate` with today (America/Toronto):
same day → no change; yesterday → `streakCount + 1`; otherwise → `1`. Update `lastActiveDate`.

**Dashboard stats** (computed in `GET /api/me/stats` from `logs` + `posts`):
- itemsLogged, itemsDiverted, kgDiverted = Σ estWeightG where diverted ÷ 1000
- diversionRate = itemsDiverted / itemsLogged (show against the City of Markham's **80% diversion target**)
- itemsGiven (my posts with status picked_up), itemsReceived (posts where claimerId == me and picked_up)
- byStream: counts per stream for the chart
- points, streakCount

Label the dashboard "Estimated — based on your logged items." Honest, not fake-precise.

---

## 6. Gemini scan

### Knowledge base: `data/markham_rules.json`

Generate **~120 common household items** as an array of:

```ts
{
  item: string, aliases: string[],
  stream: "blue_box"|"green_bin"|"garbage"|"textile_bin"|"recycling_depot"|"hazardous_depot"|"yard_waste"|"bulky_pickup"|"retailer_takeback",
  instructions: string,       // one or two sentences, Markham-specific
  reusable: boolean,          // true if a working/wearable item someone else could use
  reuse_suggestion?: string,
  est_weight_g: number
}
```

Base it on the City of Markham's "What Goes Where" guidance. Include these known Markham specifics:
- Clean **Styrofoam** → recycling depot, NOT blue box
- **Batteries, paint, chemicals, small electronics** → Household Hazardous Waste & Electronics depot
- **Textiles in any condition** (worn, torn, stained) → Markham textile donation bins (160+ across the city); wearable clothing is also `reusable: true`
- **Tires** → retailer take-back, not depots
- **Scrap metal** → depot (monthly pickup by appointment also exists)
- Multi-part items (coffee cup = cup / lid / sleeve) — each part is its own entry

Add a top-level comment in `README.md`: *"Verify rules against markham.ca What Goes Where before demo."*

`data/depots.json`: Markham Recycling Depots + the Household Hazardous Waste & Electronics depot. Use placeholder addresses marked `// TODO verify` and always include `mapsUrl: "https://www.google.com/maps/search/Markham+Recycling+Depot"` so the link works even if addresses are unverified.

### `backend/src/lib/gemini.ts`

- Input: image (base64 + mime) and optional user hint text.
- System instruction: *"You are a waste-sorting assistant for the City of Markham, Ontario. Use ONLY the rules below to decide where items go. If an item is not in the rules, infer from the closest material match and set confidence lower."* then inject `markham_rules.json` (it fits in context — no vector DB needed for the hackathon).
- Ask for **JSON only**, matching this schema (use `responseMimeType: "application/json"` and a `responseSchema`):

```ts
type ScanResult = {
  summary: string;                     // one friendly sentence: what it is
  items: Array<{
    name: string;
    material: string;
    stream: Stream;                    // enum above
    binLabel: string;                  // "Blue Box", "Green Bin", "Garbage", "Textile Bin", "Recycling Depot", "Hazardous Waste Depot", ...
    instructions: string;
    reusable: boolean;
    reuseSuggestion?: string;
    estWeightG: number;
    confidence: number;                // 0–1
  }>;
  overallReusable: boolean;            // true if any item is reusable → show "Post to Marketplace" prominently
};
```

- Validate the JSON (zod or manual). On failure, retry once; on second failure return a graceful error.

---

## 7. API routes (`backend/src/routes/`)

| Route | Method | Does |
|---|---|---|
| `/api/scan` | POST (multipart: `image`, optional `hint`) | Calls Gemini, saves `scans/{id}`, returns `{scanId, result}` |
| `/api/logs` | POST `{scanId, itemIndex}` | Creates log, awards points, updates streak |
| `/api/posts` | GET `?lat&lng&limit=50` | Open posts sorted by haversine distance; returns `distanceKm` on each |
| `/api/posts` | POST (multipart: `image`, `title`, `description`, `category`, `condition`, `lat`, `lng`, `fromScanId?`) | Uploads photo to Storage (public URL), creates post, +5 points, streak |
| `/api/posts/[id]` | GET | Post + claims (claims only visible to owner) |
| `/api/posts/[id]/claim` | POST | Adds `claims/{uid}`, increments `claimCount`. Owner cannot claim own post |
| `/api/posts/[id]/pickup` | POST (multipart: `image`, `claimerId`) | **Owner only.** Validates claimerId is in claims and status is open. Uploads pickup photo, sets `picked_up`, awards +25 owner / +15 claimer in one transaction |
| `/api/me` | GET | User doc |
| `/api/me/location` | POST `{lat, lng}` | Saves location |
| `/api/me/stats` | GET | Dashboard stats (Section 5) |
| `/api/me/posts` | GET | My posts (all statuses) |
| `/api/me/logs` | GET | My last 50 logs |
| `/api/rewards` | GET | All rewards |
| `/api/rewards/[id]/redeem` | POST | Checks balance, deducts, creates redemption, returns `{code}` |

Storage uploads: through Admin SDK, path `posts/{postId}.jpg`, `pickups/{postId}.jpg`; call `makePublic()` and return `https://storage.googleapis.com/{bucket}/{path}`.

---

## 8. Screens & UX

**Global:** bottom tab bar (Feed · Scan · Profile) on every tab page. Points badge top-right on every screen. Green/earthy palette, rounded cards, big tap targets. Loading skeletons, not spinners, on the feed.

**Login** (`/login`): "Continue with Google" + "Continue as guest" (anonymous). After login, request browser geolocation once; save via `/api/me/location`; fall back to the default Markham coordinates if denied. Redirect to `/feed`.

**Feed** (`/feed`): header "Near you · Markham". Cards: photo (square), title, category chip, condition chip, `1.2 km away`, poster avatar + first name, `3 people want this`. Tap → post detail. Floating "+" to `/posts/new`. Empty state: "Nothing nearby yet — scan something to get started."

**Post detail** (`/posts/[id]`):
- Not owner: big photo, details, **"I want this"** button (disabled after claiming → "You asked for this ✓").
- Owner: claimant list with avatars; **"Confirm pickup"** → select claimant → camera input for a handover photo → confirm → success screen "You both earned points! +25 for you."
- Picked-up posts show a "Given away ✓" ribbon and the pickup photo.

**Scan** (`/scan`): full-width camera button "Scan an item", plus "Upload a photo". Optional text hint field. While scanning: 3 rotating messages ("Identifying…", "Checking Markham's rules…").

**Scan result** (`/scan/result`): `summary` at top, then one card per item: bin label as a large colored pill (blue box = blue, green bin = green, garbage = grey, textile = purple, depot/hazardous = orange), instructions, depot link if applicable, confidence shown as a small label. Below:
- **"Log it — I'm disposing of this"** → `POST /api/logs` for each item → toast "+5 points · 3-day streak" → back to Scan.
- **"Post to Marketplace"** (primary button if `overallReusable`, secondary otherwise) → `/posts/new` prefilled with title = item name, category inferred, scan photo reused.

**Create post** (`/posts/new`): photo, title, description, category, condition. Uses user's saved location. On submit → feed, toast "+5 points".

**Profile** (`/profile`): avatar, name, points (big), streak with 🔥, then:
- **Dashboard**: 4 stat cards (Items diverted · kg diverted · Diversion rate vs 80% target · Items given away) + a small bar chart by stream.
- **"Redeem points"** button → `/rewards`.
- Tabs: **My listings** (open / given away) · **My log** (item, bin, date).

**Rewards** (`/rewards`): grid of reward cards (emoji, business, title, cost). Redeem → confirm modal → shows a 6-char code "Show this at the counter." Disabled if insufficient points.

---

## 9. Seed data (`npm run seed`)

- **8 posts** around Markham (spread across Unionville, Markham Village, Milliken, Cornell — lat/lng within ~43.82–43.90, −79.26 to −79.40), varied categories, 2 of them already `picked_up`. Use free placeholder images (e.g. picsum.photos with fixed seeds).
- **6 rewards** from **fictional** local-sounding businesses (e.g. "Unionville Main Street Café — free coffee, 50 pts", "Cornell Bakehouse — $3 off, 80 pts"). Fictional only; do not use real business names.
- **1 demo user** profile with 120 points and a 3-day streak, so the profile screen is not empty on first open.

---

## 10. Build phases & acceptance checks

**Phase 0 — Scaffold & auth (≈45 min)**
Next app, Tailwind, Firebase client + admin, login page, bottom nav, empty tab pages, `/api/me`.
✅ Sign in with Google and as guest; location saved; nav works on a phone.

**Phase 1 — Scan (≈2 h)** ← the demo spine; nothing else matters if this is flaky
`markham_rules.json`, `lib/gemini.ts`, `/api/scan`, Scan + Scan result screens.
✅ Photo of a coffee cup returns 2–3 items with correct bins; photo of Styrofoam says depot, not blue box; JSON never breaks the page.

**Phase 2 — Logging, points, streak (≈1 h)**
`lib/points.ts`, `/api/logs`, `/api/me/stats`, profile stat cards.
✅ Logging increments points and streak; stats reflect it.

**Phase 3 — Marketplace (≈2 h)**
`/api/posts` GET/POST, Feed, Create post (incl. prefill from scan), Post detail, Claim.
✅ Feed sorted by distance; "I want this" increments claim count; post created from a scan carries the photo.

**Phase 4 — Pickup confirmation (≈1 h)**
`/api/posts/[id]/pickup`, owner flow with handover photo.
✅ Both users' points increase in one transaction; post shows "Given away ✓".

**Phase 5 — Rewards (≈45 min)**
Seed rewards, `/rewards`, redeem with code.
✅ Insufficient points is blocked; redemption deducts and shows a code.

**Phase 6 — Seed, polish, deploy (≈1 h)**
`npm run seed`, empty states, toasts, README with setup steps, deploy to Vercel.
✅ Fresh clone + env vars + `npm run seed` + `npm run dev` works in under 5 minutes.

---

## 11. Demo checklist (what the judges will see)

1. Open app → feed shows a chair 0.8 km away.
2. Scan a Styrofoam tray → "Recycling Depot — not the Blue Box" → Log it → +5, streak 🔥.
3. Scan a jacket → "Textile bin, or post it" → Post to Marketplace → appears at top of feed.
4. Second phone taps "I want this" → owner confirms pickup with a photo → both get points.
5. Profile → dashboard shows kg diverted vs 80% target → Rewards → redeem a free coffee → code.

Prepare demo items: Styrofoam tray, coffee cup, a jacket, a dead phone, a battery.

---

## 12. Out of scope (do not build)

In-app chat, payments, business-side redemption portal, push notifications, moderation, admin panel, native mobile, vector database, offline mode. If something here seems needed, leave a `// TODO` and move on.

---

## 13. What changed after the hackathon

The hackathon build split the app into a Next.js frontend and an Express backend on Render's free
tier, and kept the marketplace in each browser's localStorage. The "polish" pass (October 2026)
made every advertised feature work on free hosting. Differences from the sections above:

| Spec said | Shipped |
|---|---|
| Express backend with Firebase Admin; all writes server-side | **No backend.** Firestore client SDK with `firestore.rules`; points are client-computed and rule-bounded (see README → Known limits). |
| Firebase Storage for photos | **Cloudinary unsigned uploads** (Storage needs the paid Blaze plan on new projects). Only the `secure_url` is stored. |
| `/api/scan` on Express | **Next.js route handler** (`src/app/api/scan/route.ts`, Node runtime). Verifies the Firebase ID token via the Identity Toolkit REST API, rate-limits per uid, runs Gemini within an 8 s budget (Netlify functions stop at 10 s) and returns `{ fallback: true }` on any failure so the UI falls back to the local rules matcher + "help us identify" picker. Lite Gemini models first; rules sent in compact form. |
| Google + anonymous sign-in at `/login` | Same, plus a one-tap **"Try it — no sign-up"** on the landing page, in-place **guest → Google linking** (same uid, points kept), and a privacy page. |
| Geolocation once, default to the Civic Centre | Geolocation first; a **neighbourhood picker** (11 areas) whenever location is denied, unavailable, slow or outside Markham, also reachable from the feed and Profile. `locationSource` is stored on the profile. |
| Points: +5 log / +5 post / +25 giver / +15 receiver / streaks | Same values, plus **anti-farming**: handover points need both accounts Google-linked (enforced in rules), the same pair earns at most once per 30 days, 3 handovers given and 3 received per day, 5 handover credits per rolling week, 50 log points and 3 post bonuses per day. Redeeming needs a Google account. |
| Seeded demo users and posts | **No seed data in production.** Two static, badged "Sample listing" cards show until real posts exist. Demo mode (no Firebase config) still seeds fictional neighbours for local development. |
| `recharts` on the profile | Still there, loaded with `next/dynamic` only when there is data. |
| — | **Motion**: 180 ms page transitions, staggered card entrances, points count-up, a first-login walkthrough; all respect `prefers-reduced-motion`. |
| ~120 rules, verified before demo | 146 rules, each flagged `"verified": false` until checked against markham.ca "What Goes Where". `python/scripts/validate_rules.py` reports the count. |
| Deploy on Vercel + a Node host | **Netlify only** (`netlify.toml`), free tier. |
