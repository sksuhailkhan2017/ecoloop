import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { STREAMS, type DisposalRule, type ScanItem, type ScanResult, type Stream } from "../types";

/** Read lazily so a value from .env is always honoured (see src/env.ts). */
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

const DEFAULT_RULES_PATH = fileURLToPath(new URL("../../../data/markham_rules.json", import.meta.url));

let rulesCache: DisposalRule[] | null = null;

/** Loads data/markham_rules.json (override with RULES_PATH). Small enough to inline in the prompt. */
export function loadRules(): DisposalRule[] {
  if (rulesCache) return rulesCache;
  const path = process.env.RULES_PATH || DEFAULT_RULES_PATH;
  rulesCache = JSON.parse(readFileSync(path, "utf8")) as DisposalRule[];
  return rulesCache;
}

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set — see backend/.env.example");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export type ScanImage = { base64: string; mimeType: string };
export type ScanMode = "auto" | "item" | "receipt";

/** Thrown for failures the route should turn into a friendly message (never leaks raw model output). */
export class ScanError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

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

// ---- response schema ------------------------------------------------------------------------

const itemSchema = z.object({
  name: z.string().min(1),
  productName: z.string().optional(),
  sustainabilityScore: z.number().default(50),
  material: z.string().default(""),
  stream: z.enum(STREAMS),
  binLabel: z.string().default(""),
  instructions: z.string().default(""),
  reusable: z.boolean().default(false),
  reuseSuggestion: z.string().optional(),
  estWeightG: z.number().default(50),
  confidence: z.number().default(0.5),
});

export const scanResultSchema = z.object({
  kind: z.enum(["item", "receipt"]).default("item"),
  summary: z.string().min(1),
  items: z.array(itemSchema).min(1),
  overallReusable: z.boolean().default(false),
});

/** JSON Schema handed to Gemini. `$schema` is dropped because the API does not accept it. */
function responseJsonSchema(): unknown {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(scanResultSchema) as Record<string, unknown>;
  return schema;
}

// ---- post-processing ------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** name / alias → rule, so we can check the model's answer against the knowledge base. */
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
 * agree with the stream. Pure function — unit-testable without calling Gemini.
 */
export function reconcile(raw: z.infer<typeof scanResultSchema>, rules: DisposalRule[], maxItems = 30): ScanResult {
  const index = buildRuleIndex(rules);

  const items: ScanItem[] = raw.items.slice(0, maxItems).map((it) => {
    const rule = index.get(norm(it.name));
    const stream: Stream = rule ? rule.stream : it.stream;
    const reusable = rule ? rule.reusable : it.reusable;
    // A score can't contradict the stream: garbage-only items never score as eco-friendly.
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

/**
 * Identify the item(s) in a photo (or receipt) and map each to a Markham disposal stream.
 * Validates the model output with zod and retries once before giving up with a friendly error.
 */
export async function scan(image: ScanImage, hint?: string, mode: ScanMode = "auto"): Promise<ScanResult> {
  const rules = loadRules();
  // Resolve the client before the retry loop: a missing GEMINI_API_KEY is a config problem and must
  // surface as such, not be swallowed by the retry and reported as "couldn't identify that one".
  const ai = gemini();
  const config = {
    systemInstruction: `${SYSTEM_INSTRUCTION}\n\nRULES:\n${JSON.stringify(rules)}`,
    responseMimeType: "application/json",
    responseJsonSchema: responseJsonSchema(),
    temperature: 0.2,
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: geminiModel(),
        contents: buildContents(image, mode, hint),
        config,
      });
      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      const parsed = scanResultSchema.parse(JSON.parse(text));
      return reconcile(parsed, rules, parsed.kind === "receipt" ? 25 : 8);
    } catch (err) {
      lastError = err;
      console.warn(`Gemini scan attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.error("Gemini scan failed after retry:", lastError);
  throw new ScanError(
    mode === "receipt"
      ? "We couldn't read that receipt. Try a flatter, brighter photo."
      : "We couldn't identify that one. Try another angle, or type what it is.",
  );
}
