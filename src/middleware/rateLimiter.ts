import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";

const enabled = env.NODE_ENV !== "test";

/** Broad API limiter shared by all /api routes. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !enabled,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please try again in a few minutes.",
    });
  },
});

/** Stricter limiter for the server-to-server token exchange endpoint. */
export const authExchangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !enabled,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many token exchange attempts. Please try again later.",
    });
  },
});
