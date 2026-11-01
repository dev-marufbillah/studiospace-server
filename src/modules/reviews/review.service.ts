import { ObjectId } from "mongodb";
import type { Filter } from "mongodb";
import { getDatabase, isValidObjectId, toObjectId } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import type { AuthUser } from "../../utils/jwt";

export interface ReviewRecord {
  _id: ObjectId;
  studioId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ReviewDto = Omit<ReviewRecord, "_id"> & { id: string };

function reviews() {
  return getDatabase().collection<ReviewRecord>("reviews");
}

export function serializeReview(doc: ReviewRecord): ReviewDto {
  const { _id, ...rest } = doc;
  return { id: _id.toHexString(), ...rest };
}

async function assertStudioExists(studioId: string): Promise<void> {
  if (!isValidObjectId(studioId)) throw ApiError.notFound("Studio not found.");
  const studio = await getDatabase()
    .collection("studios")
    .findOne({ _id: toObjectId(studioId) });
  if (!studio) throw ApiError.notFound("Studio not found.");
}

/** Recomputes denormalized rating/reviewCount on the studio document. */
async function recomputeStudioRating(studioId: string): Promise<void> {
  const stats = await reviews()
    .aggregate<{ avg: number; count: number }>([
      { $match: { studioId } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ])
    .toArray();

  const first = stats[0];
  const rating = first ? Math.round(first.avg * 10) / 10 : 0;
  const reviewCount = first ? first.count : 0;

  await getDatabase()
    .collection("studios")
    .updateOne({ _id: toObjectId(studioId) }, { $set: { rating, reviewCount } });
}

export async function listReviews(studioId: string): Promise<ReviewDto[]> {
  await assertStudioExists(studioId);
  const docs = await reviews()
    .find({ studioId })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return docs.map(serializeReview);
}

export interface ReviewInput {
  rating: number;
  comment: string;
}

/** POST /api/studios/:id/reviews — upserts the caller's review. */
export async function upsertReview(
  studioId: string,
  input: ReviewInput,
  user: AuthUser
): Promise<ReviewDto> {
  await assertStudioExists(studioId);

  const studio = await getDatabase()
    .collection("studios")
    .findOne({ _id: toObjectId(studioId) });
  if (studio && studio.ownerId === user.id) {
    throw ApiError.badRequest("You cannot review your own studio.");
  }

  const now = new Date();
  const updated = await reviews().findOneAndUpdate(
    { studioId, userId: user.id },
    {
      $set: {
        rating: input.rating,
        comment: input.comment,
        userName: user.name,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        studioId,
        userId: user.id,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  await recomputeStudioRating(studioId);
  if (!updated) throw ApiError.notFound("Review not found.");
  return serializeReview(updated);
}

/** DELETE /api/studios/:id/reviews — removes the caller's own review. */
export async function deleteReview(studioId: string, user: AuthUser): Promise<void> {
  const filter: Filter<ReviewRecord> = { studioId, userId: user.id };
  const result = await reviews().deleteOne(filter);
  if (result.deletedCount === 0) {
    throw ApiError.notFound("You have not reviewed this studio.");
  }
  await recomputeStudioRating(studioId);
}
