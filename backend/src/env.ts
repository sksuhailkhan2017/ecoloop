// Must be the FIRST import of every entry point (index.ts, scripts/*.ts).
//
// ES module imports are hoisted and evaluated before the importing file's own body runs, so calling
// dotenv inside index.ts happens AFTER modules like lib/gemini.ts have already read process.env.
// Importing this file first guarantees .env is loaded before anything else evaluates.
import { config } from "dotenv";

config({ quiet: true });
