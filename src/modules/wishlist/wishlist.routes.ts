import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { getValidated, validate } from "../../middleware/validate";
import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import type { AuthUser } from "../../utils/jwt";
import {
  addToWishlist,
  listWishlist,
  removeFromWishlist,
} from "./wishlist.service";

const addSchema = z.object({
  studioId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid studio id"),
});

const studioIdParamSchema = z.object({
  studioId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid studio id"),
});

function requireUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export const wishlistRouter = Router();

wishlistRouter.get("/", authenticate, async (req, res) => {
  const items = await listWishlist(requireUser(req));
  sendSuccess(res, "Wishlist fetched successfully", { items });
});

wishlistRouter.post("/", authenticate, validate(addSchema), async (req, res) => {
  const { studioId } = getValidated<{ studioId: string }>(req, "body");
  const result = await addToWishlist(requireUser(req), studioId);
  sendSuccess(
    res,
    result.added ? "Added to wishlist" : "Studio is already in your wishlist",
    result,
    result.added ? 201 : 200
  );
});

wishlistRouter.delete(
  "/:studioId",
  authenticate,
  validate(studioIdParamSchema, "params"),
  async (req, res) => {
    const { studioId } = getValidated<{ studioId: string }>(req, "params");
    await removeFromWishlist(requireUser(req), studioId);
    sendSuccess(res, "Removed from wishlist");
  }
);
