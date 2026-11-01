import { Router } from "express";
import { randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../../config/env";
import { getValidated, validate } from "../../middleware/validate";
import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { signAuthToken } from "../../utils/jwt";
import { setAuthCookie } from "../../utils/cookies";
import { durationToSeconds } from "../../utils/duration";

/**
 * Server-to-server token exchange.
 *
 * The Next.js /api/session route calls this endpoint AFTER it has
 * verified the real Better Auth session (auth.api.getSession). The shared
 * INTERNAL_API_SECRET authenticates the caller; the application JWT is
 * only ever minted for a verified Better Auth identity.
 */
const tokenExchangeSchema = z.object({
  userId: z.string().min(1).max(64),
  email: z.email("A valid email is required"),
  name: z.string().trim().max(120).default(""),
  setCookie: z.boolean().default(false),
});

function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export const authRouter = Router();

authRouter.post("/token", validate(tokenExchangeSchema), (req, res) => {
  const providedSecret = req.headers["x-internal-secret"];
  if (!secretsMatch(Array.isArray(providedSecret) ? providedSecret[0] : providedSecret, env.INTERNAL_API_SECRET)) {
    throw ApiError.unauthorized("Invalid internal service credentials.");
  }

  const input = getValidated<z.infer<typeof tokenExchangeSchema>>(req, "body");
  const token = signAuthToken({ id: input.userId, email: input.email, name: input.name });

  if (input.setCookie) setAuthCookie(res, token);

  sendSuccess(res, "Token issued successfully", {
    token,
    expiresInSeconds: durationToSeconds(env.JWT_EXPIRES_IN),
    cookieName: env.JWT_COOKIE_NAME,
  });
});
