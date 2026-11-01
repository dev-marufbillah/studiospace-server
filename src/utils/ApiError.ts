/**
 * Centralized operational error. Anything thrown as ApiError is rendered
 * with its own status code and message by the error handler.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Authentication required. Please sign in."): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(
    message = "You do not have permission to perform this action."
  ): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = "Resource not found."): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, details);
  }
}
