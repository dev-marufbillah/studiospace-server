import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { authenticate, optionalAuthenticate } from "../../middleware/authenticate";
import { getPathParam, getValidated, validate } from "../../middleware/validate";
import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import type { AuthUser } from "../../utils/jwt";
import { deleteReview, listReviews, upsertReview } from "./review.service";

const studioIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid studio id"),
});

const reviewBodySchema = z.object({
  rating: z.coerce.number().int().min(1, "Rating must be between 1 and 5").max(5),
  comment: z
    .string()
    .trim()
    .min(3, "Please write a short comment")
    .max(1000, "Comment must be 1000 characters or fewer"),
});

function requireUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

/** Mounted at /api — full paths are /studios/:id/reviews */
export const reviewRouter = Router();

reviewRouter.get(
  "/studios/:id/reviews",
  optionalAuthenticate,
  validate(studioIdParamSchema, "params"),
  async (req, res) => {
    const reviews = await listReviews(getPathParam(req, "id"));
    sendSuccess(res, "Reviews fetched successfully", { reviews });
  }
);

reviewRouter.post(
  "/studios/:id/reviews",
  authenticate,
  validate(studioIdParamSchema, "params"),
  validate(reviewBodySchema),
  async (req, res) => {
    const input = getValidated<{ rating: number; comment: string }>(req, "body");
    const review = await upsertReview(getPathParam(req, "id"), input, requireUser(req));
    sendSuccess(res, "Review saved successfully", { review }, 201);
  }
);

reviewRouter.delete(
  "/studios/:id/reviews",
  authenticate,
  validate(studioIdParamSchema, "params"),
  async (req, res) => {
    await deleteReview(getPathParam(req, "id"), requireUser(req));
    sendSuccess(res, "Review removed successfully");
  }
);
