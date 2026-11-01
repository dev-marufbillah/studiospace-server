"use strict";
/**
 * Vercel serverless entry point for the StudioSpace API.
 *
 * The repository's primary target is a long-running Node process
 * (`node dist/server.js`, used on Render/Local). Vercel has no long-lived
 * process, so this catch-all function boots the *same* Express app once per
 * warm instance and forwards every /api/* request to it.
 *
 * Deploy settings (vercel.json in this folder):
 *   build: npm install --legacy-peer-deps && npm run build
 *   output: the dist/ folder is bundled into the function via includeFiles
 */
const { createApp } = require("../dist/app.js");
const { connectDatabase } = require("../dist/config/database.js");

let ready = null;

async function boot() {
  if (!ready) {
    ready = (async () => {
      await connectDatabase();
      return createApp();
    })().catch((error) => {
      ready = null; // allow a retry on the next request
      throw error;
    });
  }
  return ready;
}

/** Rebuild the Express-visible URL when Vercel hands us the catch-all route only. */
function restoreUrl(req) {
  const url = req.url || "";
  if (url.startsWith("/api/")) return;
  const raw = req.query && req.query.path;
  const segments = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === "path") continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else if (value !== undefined) search.append(key, String(value));
  }
  const qs = search.toString();
  req.url = `/api/${segments.join("/")}${qs ? `?${qs}` : ""}`;
}

module.exports = async function handler(req, res) {
  try {
    const app = await boot();
    restoreUrl(req);
    return app(req, res);
  } catch (error) {
    console.error("[StudioSpace API] serverless boot failed:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message: "The API could not start. Check MONGODB_URI and the other environment variables.",
      })
    );
  }
};
