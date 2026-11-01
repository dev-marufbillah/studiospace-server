import { NextFunction, Request, Response } from "express";
import { MongoServerError } from "mongodb";
import { ZodError } from "zod";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

interface ErrorWithBody extends Error {
  type?: unknown;
}

function isPayloadTooLarge(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    "type" in err &&
    (err as ErrorWithBody).type === "entity.too.large"
  );
}

function isMalformedJson(err: unknown): boolean {
  return err instanceof SyntaxError && "body" in err;
}

/** Plain 404 for unknown API routes (kept behind the main router). */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Centralized error handler. Every thrown ApiError / ZodError / Mongo
 * duplicate-key error is translated into the shared JSON envelope.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof MongoServerError && err.code === 11000) {
    res.status(409).json({
      success: false,
      message: "A record with the same unique value already exists.",
    });
    return;
  }

  if (isPayloadTooLarge(err)) {
    res.status(413).json({
      success: false,
      message: "Payload too large. Please upload a smaller image (max 8 MB).",
    });
    return;
  }

  if (isMalformedJson(err)) {
    res.status(400).json({ success: false, message: "Invalid JSON payload." });
    return;
  }

  if (env.NODE_ENV !== "test" || process.env.DEBUG_API_ERRORS === "1") {
    console.error("[StudioSpace API] Unhandled error:", err);
  }

  const message =
    env.NODE_ENV === "production"
      ? "An unexpected error occurred on the server."
      : err instanceof Error
        ? err.message
        : "Unknown error";

  res.status(500).json({ success: false, message });
}
