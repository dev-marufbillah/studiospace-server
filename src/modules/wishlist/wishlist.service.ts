import { ObjectId } from "mongodb";
import { getDatabase, toObjectId } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import type { AuthUser } from "../../utils/jwt";
import { serializeStudio, type StudioDto, type StudioRecord } from "../studios/studio.service";

interface WishlistRecord {
  _id: ObjectId;
  userId: string;
  studioId: string;
  createdAt: Date;
}

export interface WishlistItemDto {
  id: string;
  studioId: string;
  createdAt: Date;
  studio: StudioDto;
}

function wishlist() {
  return getDatabase().collection<WishlistRecord>("wishlist");
}

/** GET /api/wishlist — saved studios of the caller (stale rows filtered). */
export async function listWishlist(user: AuthUser): Promise<WishlistItemDto[]> {
  const rows = await wishlist()
    .find({ userId: user.id })
    .sort({ createdAt: -1 })
    .toArray();
  if (rows.length === 0) return [];

  const studioIds = rows.map((row) => {
    try {
      return toObjectId(row.studioId);
    } catch {
      return null;
    }
  });
  const validIds = studioIds.filter((id): id is ObjectId => id !== null);
  const studios = await getDatabase()
    .collection<StudioRecord>("studios")
    .find({ _id: { $in: validIds } })
    .toArray();
  const byId = new Map(studios.map((doc) => [doc._id.toHexString(), doc]));

  const items: WishlistItemDto[] = [];
  for (const row of rows) {
    const studio = byId.get(row.studioId);
    if (studio) {
      items.push({
        id: row._id.toHexString(),
        studioId: row.studioId,
        createdAt: row.createdAt,
        studio: serializeStudio(studio),
      });
    }
  }
  return items;
}

/** POST /api/wishlist — idempotent add. */
export async function addToWishlist(
  user: AuthUser,
  studioId: string
): Promise<{ added: boolean }> {
  const studio = await getDatabase()
    .collection("studios")
    .findOne({ _id: toObjectId(studioId) });
  if (!studio) throw ApiError.notFound("Studio not found.");

  const existing = await wishlist().findOne({ userId: user.id, studioId });
  if (existing) return { added: false };

  try {
    await wishlist().insertOne({
      _id: new ObjectId(),
      userId: user.id,
      studioId,
      createdAt: new Date(),
    });
    return { added: true };
  } catch (error) {
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000;
    if (duplicate) return { added: false };
    throw error;
  }
}

/** DELETE /api/wishlist/:studioId — idempotent remove. */
export async function removeFromWishlist(
  user: AuthUser,
  studioId: string
): Promise<void> {
  await wishlist().deleteOne({ userId: user.id, studioId });
}
