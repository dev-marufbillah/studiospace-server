import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/ApiError";
import type { ValidationSource } from "../types/express";

interface IssueDetail {
  path: string;
  message: string;
}

/**
 * Validates the chosen request source with a Zod schema. Parsed data is
 * stored on `req.validated` (Express 5 makes req.query read-only, so the
 * parsed value is read back through getValidated() instead of mutation).
 */
export function validate(schema: ZodType, source: ValidationSource = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details: IssueDetail[] = result.error.issues.map((issue) => ({
        path: issue.path.join(".") || source,
        message: issue.message,
      }));
      next(new ApiError(400, "Validation failed", details));
      return;
    }
    req.validated = { ...(req.validated ?? {}), [source]: result.data };
    next();
  };
}

/** Reads the validated payload produced by validate(). */
export function getValidated<T>(req: Request, source: ValidationSource): T {
  const value = req.validated?.[source];
  if (value === undefined) {
    throw new ApiError(500, `Missing validated ${source} for ${req.method} ${req.path}`);
  }
  return value as T;
}

/**
 * Reads a single path parameter as a string (Express 5 types allow
 * string[] for repeated parameters).
 */
export function getPathParam(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === "string" ? value : "";
}
