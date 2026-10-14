import express from "express";
import cors from "cors";
import "dotenv/config";

import healthRoute from "./routes/health.js";
import scanRoute from "./routes/scan.js";
import extensionsRoute from "./routes/extensions.js";
import authRoute from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 4000;

// The extension's popup runs as a chrome-extension:// origin, and the
// background service worker runs with no browser-enforced origin at all,
// so CORS just needs to not block the extension's calls in dev.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== "*" ? process.env.CORS_ORIGIN.split(",") : true,
  })
);
app.use(express.json({ limit: "1mb" }));

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../../extension/dist");
const publicPath = path.resolve(__dirname, "../public");

// Serve landing page assets
app.use(express.static(publicPath));

// Serve React extension options dashboard
app.use("/dashboard", express.static(distPath));
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(distPath, "options.html"));
});

// Landing page and login routes
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// API Info endpoint
app.get("/api", (_req, res) => {
  res.json({
    name: "Browser Extension Permission Risk Auditor API",
    dashboard: "http://localhost:" + PORT + "/dashboard/options.html",
    endpoints: [
      "GET /api/health",
      "POST /api/scan",
      "GET /api/extensions",
      "GET /api/extensions/:id/history",
      "POST /api/auth/login",
      "POST /api/auth/register",
      "GET /api/auth/me",
    ],
  });
});

app.use("/api/health", healthRoute);
app.use("/api/scan", scanRoute);
app.use("/api/extensions", extensionsRoute);
app.use("/api/auth", authRoute);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Extension Risk Auditor API listening on http://localhost:${PORT}`);
});
