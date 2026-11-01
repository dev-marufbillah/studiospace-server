import type { CorsOptions } from "cors";
import { env } from "./env";

/**
 * CORS is locked down to the exact frontend origin with credentials
 * enabled. Wildcard origins are never used together with credentials.
 *
 * In the default deployment the browser talks to this API through the
 * Next.js rewrite proxy (same-origin), so CORS mainly serves direct
 * API access (Postman/curl) and optional cross-origin setups.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      // Non-browser clients (curl, server-to-server) send no Origin header.
      callback(null, true);
      return;
    }
    callback(null, origin === env.CLIENT_URL);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Internal-Secret"],
  maxAge: 600,
};
