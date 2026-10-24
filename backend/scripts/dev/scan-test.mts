// Dev helper: node --import tsx scripts/dev/scan-test.mts <image> [hint]   (needs backend/.env)
import { readFileSync } from "node:fs";
import "../../src/env";
const { scan } = await import("../../src/lib/gemini.ts");
const [file, hint = ""] = process.argv.slice(2);
const t0 = Date.now();
try {
  const r = await scan({ base64: readFileSync(file).toString("base64"), mimeType: "image/jpeg" }, hint);
  console.log(`OK ${Date.now() - t0}ms:`, r.summary, "|", r.items.map((i) => `${i.name} -> ${i.binLabel} (${i.confidence})`).join("; "));
} catch (e) {
  console.log(`FAIL ${Date.now() - t0}ms:`, (e as Error).message);
}
