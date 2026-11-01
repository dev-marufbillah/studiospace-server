"use strict";
/**
 * Vercel serverless entry point for the StudioSpace API.
 *
 * The primary deployment target is a long-running Node process
 * (`node dist/server.js` — used locally and on Render). Vercel has no
 * long-lived process, so this single function boots the *same* Express app
 * once per warm instance and forwards every request to it.
 *
 * vercel.json rewrites every path here and passes the original path in
 * `?__path=…`, which keeps Express routing (and query strings) intact no
 * matter how Vercel normalises the incoming URL.
 */
const { createApp } = require("../dist/app.js");
const { connectDatabase } = require("../dist/config/database.js");

let ready = null;

function boot() {
  if (!ready) {
    ready = (async () => {
      await connectDatabase();
      return createApp();
    })().catch((error) => {
      ready = null; // retry on the next request instead of caching the failure
      throw error;
    });
  }
  return ready;
}

/** Rebuilds the Express-visible URL from the rewrite parameter. */
function resolveUrl(req) {
  const query = { ...(req.query || {}) };
  let original = query.__path;
  delete query.__path;
  if (Array.isArray(original)) original = original.join("/");

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else if (value !== undefined) search.append(key, String(value));
  }
  const qs = search.toString();

  // Fallback: Vercel already gave us the real path (no rewrite parameter).
  const fallback = typeof req.url === "string" ? req.url : "/api";
  const path = original ? `/${String(original)}` : fallback.split("?")[0] || "/api";
  return qs ? `${path}?${qs}` : path;
}

module.exports = async function handler(req, res) {
  try {
    const app = await boot();
    req.url = resolveUrl(req);
    return app(req, res);
  } catch (error) {
    console.error("[StudioSpace API] serverless boot failed:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message:
          "The API could not start. Check MONGODB_URI and the other environment variables.",
      })
    );
  }
};
