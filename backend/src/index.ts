import "./env"; // must stay first: loads .env before any other module reads process.env

import cors from "cors";
import express from "express";

import { logsRouter } from "./routes/logs";
import { meRouter } from "./routes/me";
import { postsRouter } from "./routes/posts";
import { rewardsRouter } from "./routes/rewards";
import { scanRouter } from "./routes/scan";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ecoloop-backend", time: new Date().toISOString() });
});

// Section 7 of docs/SPEC.md — one router per resource.
app.use("/api/scan", scanRouter);
app.use("/api/logs", logsRouter);
app.use("/api/posts", postsRouter);
app.use("/api/me", meRouter);
app.use("/api/rewards", rewardsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`ecoloop-backend listening on http://localhost:${port}`);
  console.log(`CORS origins: ${allowedOrigins.join(", ")}`);
});
