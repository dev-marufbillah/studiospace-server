"use strict";
/**
 * Kept for Vercel's filesystem routing: nested /api/* paths hit this dynamic
 * segment. All logic lives in ./index.js so both entry points behave the same.
 */
module.exports = require("./index.js");
