"use strict";
const { createApp } = require("../dist/app.js");
const { connectDatabase } = require("../dist/config/database.js");
let ready = null;
function boot() {
  if (!ready) {
    ready = (async () => { await connectDatabase(); return createApp(); })().catch((err) => { ready = null; throw err; });
  }
  return ready;
}
function resolveUrl(req) {
  const q = Object.assign({}, req.query || {});
  let original = q.__path;
  delete q.__path;
  delete q.path;
  if (Array.isArray(original)) original = original.join("/");
  const params = new URLSearchParams();
  Object.keys(q).forEach((key) => {
    const value = q[key];
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
    else if (value !== undefined) params.append(key, String(value));
  });
  const qs = params.toString();
  const raw = typeof req.url === "string" && req.url ? req.url : "/api";
  const base = raw.split("?")[0] || "/api";
  const path = original ? "/" + String(original) : base;
  return qs ? path + "?" + qs : path;
}
module.exports = async function handler(req, res) {
  try {
    const app = await boot();
    req.url = resolveUrl(req);
    return app(req, res);
  } catch (err) {
    console.error("[StudioSpace API] serverless boot failed:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "The API could not start. Check MONGODB_URI and the other environment variables." }));
  }
};
