import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { verifyAuthToken } from "../utils/jwt";

function readToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const cookieValue = cookies?.[env.JWT_COOKIE_NAME];
  if (typeof cookieValue === "string" && cookieValue.length > 0) {
    return cookieValue;
  }
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const bearer = header.slice("Bearer ".length);
    if (bearer.length > 0) return bearer;
  }
  return undefined;
}

/**
 * Requires a valid application JWT (HTTPOnly cookie or Bearer header).
 * Rejects missing (401), expired (401) and tampered (401) tokens.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) {
    next(ApiError.unauthorized("Authentication required. Please sign in."));
    return;
  }
  try {
    req.user = verifyAuthToken(token);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new ApiError(401, "Your session has expired. Please sign in again."));
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      next(new ApiError(401, "Invalid authentication token."));
      return;
    }
    next(err);
  }
}

/** Attaches req.user when a valid token is present; never rejects. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    req.user = verifyAuthToken(token);
  } catch {
    // Invalid token on a public endpoint is treated as anonymous.
  }
  next();
}
