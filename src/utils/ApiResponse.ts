import type { Response } from "express";

/** Successful response envelope shared by every endpoint. */
export function sendSuccess<T>(
  res: Response,
  message: string,
  data?: T,
  statusCode = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
  });
}

/** Error response envelope shared by every endpoint. */
export function sendError(res: Response, statusCode: number, message: string): Response {
  return res.status(statusCode).json({ success: false, message });
}
