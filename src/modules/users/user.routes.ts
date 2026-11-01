import { Router } from "express";
import type { Request } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDatabase, toObjectId } from "../../config/database";
import { authenticate } from "../../middleware/authenticate";
import { getValidated, validate } from "../../middleware/validate";
import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import type { AuthUser } from "../../utils/jwt";

/**
 * Profile endpoints. The `users` collection is written by Better Auth
 * (MongoDB adapter with plural collection names) — this API only reads
 * and updates profile fields on the caller's own document.
 */
interface BetterAuthUserDoc {
  _id: ObjectId;
  name?: unknown;
  email?: unknown;
  image?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    image: z
      .string()
      .trim()
      .max(2048, "Image URL is too long")
      .refine(
        (value) => value === "" || /^https?:\/\//.test(value) || value.startsWith("/images/"),
        "Image must be an http(s) URL"
      ),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update",
  });

function requireUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

function buildProfile(user: AuthUser, doc: BetterAuthUserDoc | null) {
  return {
    id: user.id,
    name: typeof doc?.name === "string" ? doc.name : user.name,
    email: typeof doc?.email === "string" ? doc.email : user.email,
    image: typeof doc?.image === "string" ? doc.image : null,
    createdAt: doc?.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
  };
}

async function findUserDoc(user: AuthUser): Promise<BetterAuthUserDoc | null> {
  try {
    return await getDatabase()
      .collection<BetterAuthUserDoc>("users")
      .findOne({ _id: toObjectId(user.id) });
  } catch {
    return null;
  }
}

export const userRouter = Router();

userRouter.get("/me", authenticate, async (req, res) => {
  const user = requireUser(req);
  const doc = await findUserDoc(user);
  sendSuccess(res, "Profile fetched successfully", { user: buildProfile(user, doc) });
});

userRouter.patch("/me", authenticate, validate(updateProfileSchema), async (req, res) => {
  const user = requireUser(req);
  const input = getValidated<{ name?: string; image?: string }>(req, "body");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.image !== undefined) updates.image = input.image === "" ? null : input.image;

  try {
    await getDatabase()
      .collection("users")
      .updateOne({ _id: toObjectId(user.id) }, { $set: updates });
  } catch {
    throw ApiError.notFound("User profile not found.");
  }

  const doc = await findUserDoc(user);
  const profile = buildProfile(user, doc);
  // Keep the JWT snapshot in sync so /api/users/me-style data agrees
  // across requests until the next token exchange.
  sendSuccess(res, "Profile updated successfully", { user: profile });
});
