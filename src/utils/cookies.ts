import type { Response } from "express";
import { env } from "../config/env";
import { durationToMs } from "./duration";

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Sets the HTTPOnly auth cookie. `secure` is enabled in production and
 * SameSite=Lax is correct because the browser reaches this API through
 * the same-origin Next.js rewrite proxy.
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.JWT_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: durationToMs(env.JWT_EXPIRES_IN),
  });
}

/** Removes the auth cookie (logout / session cleanup). */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.JWT_COOKIE_NAME, baseCookieOptions());
}
