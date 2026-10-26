// Server-only: Gemini vision scan against data/markham_rules.json. Runs inside the Next.js route
// handler (Node runtime). Netlify functions have a 10 s limit, so every call carries a deadline and
// the route returns { fallback: true } when it cannot finish in time.

import { GoogleGenAI } from "@google/genai";

import depotsJson from "../../../../data/depots.json";
import rulesJson from "../../../../data/markham_rules.json";
import { STREAMS, type DisposalRule, type ScanItem, type ScanResult, type Stream } from "../types";

export const RULES = rulesJson as DisposalRule[];
void depotsJson; // depots are rendered client-side; imported here only so the bundle keeps data/ in sync

// Lite models answer a sorting question in ~1.5 s; the full flash models often take 8–30 s under
// load, which does not fit Netlify's 10 s function limit. Lite first, flash as a last resort.
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
/** Tried in order when a model is retired (404), throttled (429) or overloaded (503). */
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
/** Lite models reject thinkingConfig with 400; the others are much faster with thinking off. */
const supportsThinkingConfig = (model: string) => !/lite/.test(model);

const isRetryable = (err: unknown) =>
  /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded|high demand|404|NOT_FOUND|no longer available/i.test(err instanceof Error ? err.message : String(err));

export const SYSTEM_INSTRUCTION = `You are the scanner for EcoLoop, a waste-reduction app for residents of Markham, Ontario.
The photo may show (A) a single item or product, such as a bottle, can, jacket or
electronic device, or (B) a store receipt. First decide which one it is, then follow
the matching steps. Use ONLY the Markham rules provided to decide where things go.

IF IT IS AN ITEM (A):
1. Read any label, brand or printed text to name the product as specifically as
   possible (e.g. "Dasani 500 mL plastic water bottle"), then give a short generic
   name that matches the rules (e.g. "Plastic water bottle").
2. List the material, and list each part separately if parts are sorted differently
   (bottle + cap + label).
3. For each part, give the Markham stream and one or two plain sentences of instructions.
4. Say whether it can be reused, refilled, repaired or donated, and suggest how.
5. Give a sustainabilityScore from 0 to 100 for the best way to deal with it:
   90-100 reuse or refill, 75-89 repair or donate, 55-74 recycle or compost correctly,
   20-54 recycle with effort or contamination risk, 0-19 garbage only.

IF IT IS A RECEIPT (B):
1. Read each purchased line item. Ignore taxes, totals, fees, bags, discounts and gift cards.
2. For each product with packaging or end-of-life waste, give one entry with the product
   name and how its packaging should be sorted. Merge duplicates. Maximum 25 entries.
3. Give each entry a sustainabilityScore the same way, and mention if a lower-waste
   alternative exists (refill, bulk, reusable) in reuseSuggestion.
4. If the text is unreadable, return one entry named "Unreadable receipt" with confidence 0.1.

RULES FOR BOTH:
- Set "kind" to "item" or "receipt".
- Put the generic rule-matching name in "name" and the label-level name in "productName".
- Never invent a stream. If the item is not in the rules, use the closest material
  match and lower the confidence.
- Do not guess brands you cannot read. If unsure, use the generic name.
- If the photo is blurry, empty or not a waste item, say so in the summary and return
  one entry with confidence below 0.3.
- Keep the summary to one friendly sentence. Respond with JSON only.`;

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export type ScanImage = { base64: string; mimeType: string };
export type ScanMode = "auto" | "item" | "receipt";

export const STREAM_LABELS: Record<Stream, string> = {
  blue_box: "Blue Box",
  green_bin: "Green Bin",
  garbage: "Garbage",
  textile_bin: "Textile Bin",
  recycling_depot: "Recycling Depot",
  hazardous_depot: "Hazardous Waste Depot",
  yard_waste: "Yard Waste",
  bulky_pickup: "Bulky Item Pickup",
  retailer_takeback: "Retailer Take-back",
};

// ---- response schema (hand-written JSON Schema; no runtime validator dependency) ---------------

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["item", "receipt"] },
    summary: { type: "string" },
    overallReusable: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          productName: { type: "string" },
          sustainabilityScore: { type: "number" },
          material: { type: "string" },
          stream: { type: "string", enum: [...STREAMS] },
          binLabel: { type: "string" },
          instructions: { type: "string" },
          reusable: { type: "boolean" },
          reuseSuggestion: { type: "string" },
          estWeightG: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["name", "stream"],
      },
    },
  },
  required: ["summary", "items"],
} as const;

type RawItem = {
  name: string;
  productName?: string;
  sustainabilityScore: number;
  material: string;
  stream: Stream;
  binLabel: string;
  instructions: string;
  reusable: boolean;
  reuseSuggestion?: string;
  estWeightG: number;
  confidence: number;
};
type RawResult = { kind: "item" | "receipt"; summary: string; items: RawItem[]; overallReusable: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const optStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** Shape-checks the model's JSON. Returns null when it is unusable (caller retries). */
export function parseScanResult(json: unknown): RawResult | null {
  if (!isObj(json)) return null;
  const summary = str(json.summary).trim();
  if (!summary || !Array.isArray(json.items)) return null;
  const items: RawItem[] = [];
  for (const it of json.items) {
    if (!isObj(it)) continue;
    const name = str(it.name).trim();
    const stream = it.stream;
    if (!name || typeof stream !== "string" || !(STREAMS as readonly string[]).includes(stream)) continue;
    items.push({
      name,
      productName: optStr(it.productName),
      sustainabilityScore: num(it.sustainabilityScore, 50),
      material: str(it.material),
      stream: stream as Stream,
      binLabel: str(it.binLabel),
      instructions: str(it.instructions),
      reusable: bool(it.reusable, false),
      reuseSuggestion: optStr(it.reuseSuggestion),
      estWeightG: num(it.estWeightG, 50),
      confidence: num(it.confidence, 0.5),
    });
  }
  if (items.length === 0) return null;
  return { kind: json.kind === "receipt" ? "receipt" : "item", summary, items, overallReusable: bool(json.overallReusable, false) };
}

// ---- post-processing ------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function buildRuleIndex(rules: DisposalRule[]): Map<string, DisposalRule> {
  const index = new Map<string, DisposalRule>();
  for (const rule of rules) {
    for (const name of [rule.item, ...rule.aliases]) {
      const key = norm(name);
      if (key && !index.has(key)) index.set(key, rule);
    }
  }
  return index;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/**
 * Makes the model output safe to show: where an item exactly matches a Markham rule the rule wins
 * (the model must not contradict the City's guidance), numbers are clamped, and bin labels always
 * agree with the stream. Pure function.
 */
export function reconcile(raw: RawResult, rules: DisposalRule[], maxItems = 30): ScanResult {
  const index = buildRuleIndex(rules);
  const items: ScanItem[] = raw.items.slice(0, maxItems).map((it) => {
    const rule = index.get(norm(it.name));
    const stream: Stream = rule ? rule.stream : it.stream;
    const reusable = rule ? rule.reusable : it.reusable;
    let score = Math.round(clamp(it.sustainabilityScore, 0, 100));
    if (stream === "garbage" && !reusable) score = Math.min(score, 19);
    return {
      name: it.name.trim(),
      productName: it.productName?.trim() || undefined,
      sustainabilityScore: score,
      material: it.material.trim(),
      stream,
      binLabel: STREAM_LABELS[stream],
      instructions: (rule ? rule.instructions : it.instructions).trim(),
      reusable,
      reuseSuggestion: (rule ? rule.reuse_suggestion : it.reuseSuggestion) || undefined,
      estWeightG: Math.round(clamp(rule ? rule.est_weight_g : it.estWeightG, 1, 100_000)),
      confidence: clamp(rule ? Math.max(it.confidence, 0.85) : it.confidence, 0, 1),
    };
  });
  return { kind: raw.kind, summary: raw.summary.trim(), items, overallReusable: items.some((i) => i.reusable) };
}

// ---- prompts --------------------------------------------------------------------------------

const MODE_HINT: Record<ScanMode, string> = {
  auto: "Decide yourself whether the photo shows an item or a receipt.",
  item: "The user says this photo shows an ITEM.",
  receipt: "The user says this photo is a RECEIPT.",
};

function buildContents(image: ScanImage, mode: ScanMode, hint?: string) {
  const text = [
    MODE_HINT[mode],
    hint?.trim() ? `The user says: "${hint.trim().slice(0, 120)}".` : "",
    "Respond with JSON only, matching the schema. Keep instructions to one or two sentences, Markham-specific. " +
      "reuseSuggestion is only for items that still work or are wearable. estWeightG is grams. confidence is 0 to 1.",
  ]
    .filter(Boolean)
    .join("\n");
  return [{ role: "user" as const, parts: [{ inlineData: { data: image.base64, mimeType: image.mimeType } }, { text }] }];
}

export type ScanOutcome = { ok: true; result: ScanResult; model: string } | { ok: false; reason: "quota" | "timeout" | "unreadable" | "not_configured" | "error"; detail: string };

/** Minimum time worth starting another model attempt with. */
const MIN_ATTEMPT_MS = 2_000;
/**
 * Rules go into the prompt in a compact "item (aliases) -> stream" form (~10 KB instead of the
 * ~45 KB JSON): the model only has to pick the stream; `reconcile` overlays the City's exact
 * instructions and weights from the full rule whenever the item name matches.
 */
const COMPACT_RULES = RULES.map((r) => `${r.item}${r.aliases.length ? ` (${r.aliases.slice(0, 4).join(", ")})` : ""} -> ${r.stream}`).join("\n");
const SYSTEM_WITH_RULES = `${SYSTEM_INSTRUCTION}\n\nRULES (item (aliases) -> stream):\n${COMPACT_RULES}`;

/**
 * Identify the item(s) in a photo and map each to a Markham stream, within `deadlineMs`
 * (absolute epoch ms). Never throws: every failure becomes { ok: false, reason }.
 */
export async function scan(image: ScanImage, { hint, mode = "auto", deadlineMs }: { hint?: string; mode?: ScanMode; deadlineMs: number }): Promise<ScanOutcome> {
  const ai = gemini();
  if (!ai) return { ok: false, reason: "not_configured", detail: "GEMINI_API_KEY is not set" };

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), Math.max(0, deadlineMs - Date.now()));
  let lastError: unknown;
  let sawRetryable = false;

  const tryModel = async (model: string): Promise<ScanResult | null> => {
    let withThinking = supportsThinkingConfig(model);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = deadlineMs - Date.now();
      if (remaining < MIN_ATTEMPT_MS) return null;
      const t0 = Date.now();
      try {
        const response = await ai.models.generateContent({
          model,
          contents: buildContents(image, mode, hint),
          config: {
            systemInstruction: SYSTEM_WITH_RULES,
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: mode === "receipt" ? 3072 : 1536,
            // The API rejects deadlines under 10 s ("Minimum allowed deadline is 10s"), so the real
            // budget is enforced by abortSignal below; this only caps a runaway request.
            httpOptions: { timeout: 10_000 },
            abortSignal: controller.signal,
            // Sorting is lookup-style work: skipping extended thinking cuts latency dramatically.
            // Some models reject thinkingConfig with 400 — then retry the same model without it.
            ...(withThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        });
        const text = response.text;
        if (!text) throw new Error("Empty response from Gemini");
        const parsed = parseScanResult(JSON.parse(text));
        if (!parsed) throw new Error("Unusable JSON from Gemini");
        return reconcile(parsed, RULES, parsed.kind === "receipt" ? 25 : 8);
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`scan: ${model} attempt ${attempt} failed after ${Date.now() - t0} ms: ${msg.slice(0, 160)}`);
        if (controller.signal.aborted) return null;
        if (isRetryable(err)) {
          sawRetryable = true;
          return null;
        }
        if (withThinking && /INVALID_ARGUMENT|\b400\b/.test(msg)) {
          withThinking = false;
          continue;
        }
        // Invalid JSON etc. → one more try on the same model.
      }
    }
    return null;
  };

  try {
    const models = [geminiModel(), ...FALLBACK_MODELS.filter((m) => m !== geminiModel())];
    for (const model of models) {
      const result = await tryModel(model);
      if (result) return { ok: true, result, model };
      if (controller.signal.aborted || deadlineMs - Date.now() < MIN_ATTEMPT_MS) break;
    }
  } finally {
    clearTimeout(killer);
  }

  const detail = lastError instanceof Error ? lastError.message.slice(0, 200) : String(lastError ?? "");
  if (controller.signal.aborted || /abort|timeout|timed out/i.test(detail)) return { ok: false, reason: "timeout", detail };
  if (sawRetryable) return { ok: false, reason: "quota", detail };
  if (/JSON|Unusable|Empty response/i.test(detail)) return { ok: false, reason: "unreadable", detail };
  return { ok: false, reason: "error", detail };
}
