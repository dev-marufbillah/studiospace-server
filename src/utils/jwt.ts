import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { durationToSeconds } from "./duration";

/** Authenticated identity carried inside every application JWT. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface StoredJwtPayload extends jwt.JwtPayload {
  email?: unknown;
  name?: unknown;
}

/**
 * Signs the application JWT used for protected mutations.
 * The secret never leaves the server; the token itself rides in an
 * HTTPOnly cookie (or an Authorization header for API testing).
 */
export function signAuthToken(user: AuthUser): string {
  return jwt.sign({ email: user.email, name: user.name }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: durationToSeconds(env.JWT_EXPIRES_IN),
  });
}

/**
 * Verifies signature and expiry. Throws jsonwebtoken errors
 * (TokenExpiredError / JsonWebTokenError) on invalid input.
 */
export function verifyAuthToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as StoredJwtPayload;

  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new jwt.JsonWebTokenError("Malformed token payload");
  }
  if (typeof decoded.email !== "string" || typeof decoded.name !== "string") {
    throw new jwt.JsonWebTokenError("Malformed token payload");
  }
  if (decoded.exp !== undefined && decoded.exp * 1000 <= Date.now()) {
    throw new jwt.TokenExpiredError("jwt expired", new Date(decoded.exp * 1000));
  }

  return { id: decoded.sub, email: decoded.email, name: decoded.name };
}
