import { ObjectId } from "mongodb";
import type { Filter, Sort } from "mongodb";
import { getDatabase, isValidObjectId, toObjectId } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { escapeRegex } from "../../utils/validators";
import type { AuthUser } from "../../utils/jwt";
import type {
  StudioCreateInput,
  StudioQueryInput,
  StudioUpdateInput,
} from "./studio.validation";
import type { StudioSortOption } from "./studio.constants";

export interface StudioLocation {
  address: string;
  city: string;
}

export interface StudioRecord {
  _id: ObjectId;
  title: string;
  category: string;
  description: string;
  hourlyRate: number;
  securityDeposit: number;
  maxCapacity: number;
  location: StudioLocation;
  imageUrl: string;
  gallery: string[];
  amenities: string[];
  equipment: string[];
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  rating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** API shape of a studio (string id instead of ObjectId). */
export type StudioDto = Omit<StudioRecord, "_id"> & { id: string };

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function serializeStudio(doc: StudioRecord): StudioDto {
  const { _id, ...rest } = doc;
  return { id: _id.toHexString(), ...rest };
}

function studios() {
  return getDatabase().collection<StudioRecord>("studios");
}

async function mustFind(id: string): Promise<StudioRecord> {
  if (!isValidObjectId(id)) throw ApiError.notFound("Studio not found.");
  const studio = await studios().findOne({ _id: toObjectId(id) });
  if (!studio) throw ApiError.notFound("Studio not found.");
  return studio;
}

function assertOwner(studio: StudioRecord, user: AuthUser): void {
  if (studio.ownerId !== user.id) {
    throw ApiError.forbidden("You are not authorized to modify this studio.");
  }
}

const SORT_MAP: Record<StudioSortOption, Sort> = {
  newest: { createdAt: -1 },
  rating: { rating: -1, reviewCount: -1, createdAt: -1 },
  "price-asc": { hourlyRate: 1, createdAt: -1 },
  "price-desc": { hourlyRate: -1, createdAt: -1 },
};

/** GET /api/studios — server-side search, filters, sorting, pagination. */
export async function listStudios(query: StudioQueryInput) {
  const filter: Filter<StudioRecord> = {};

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [
      { title: pattern },
      { description: pattern },
      { category: pattern },
      { "location.city": pattern },
      { "location.address": pattern },
    ];
  }
  if (query.category) filter.category = query.category;
  if (query.city) filter["location.city"] = new RegExp(`^${escapeRegex(query.city)}$`, "i");
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.hourlyRate = {
      ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
    };
  }
  if (query.minRating !== undefined) filter.rating = { $gte: query.minRating };
  if (query.capacity !== undefined) filter.maxCapacity = { $gte: query.capacity };
  if (query.amenities) {
    const required = query.amenities
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (required.length > 0) filter.amenities = { $all: required };
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 9;
  const sort = SORT_MAP[query.sort ?? "newest"];

  const [docs, total] = await Promise.all([
    studios()
      .find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    studios().countDocuments(filter),
  ]);

  return {
    studios: docs.map(serializeStudio),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    } satisfies Pagination,
  };
}

/** GET /api/studios/featured — at most 6, best rated / newest first. */
export async function listFeaturedStudios(): Promise<StudioDto[]> {
  const docs = await studios()
    .find({})
    .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
    .limit(6)
    .toArray();
  return docs.map(serializeStudio);
}

/** GET /api/studios/:id */
export async function getStudio(id: string): Promise<StudioDto> {
  return serializeStudio(await mustFind(id));
}

/** POST /api/studios — identity comes from the verified JWT, never the body. */
export async function createStudio(
  input: StudioCreateInput,
  user: AuthUser
): Promise<StudioDto> {
  const now = new Date();
  const doc: StudioRecord = {
    _id: new ObjectId(),
    title: input.title,
    category: input.category,
    description: input.description,
    hourlyRate: input.hourlyRate,
    securityDeposit: input.securityDeposit,
    maxCapacity: input.maxCapacity,
    location: { address: input.address, city: input.city },
    imageUrl: input.imageUrl,
    gallery: input.gallery,
    amenities: input.amenities,
    equipment: input.equipment,
    ownerId: user.id,
    ownerEmail: user.email,
    ownerName: user.name,
    rating: 0,
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await studios().insertOne(doc);
  return serializeStudio(doc);
}

/** PUT /api/studios/:id — owner-only update of whitelisted fields. */
export async function updateStudio(
  id: string,
  input: StudioUpdateInput,
  user: AuthUser
): Promise<StudioDto> {
  const studio = await mustFind(id);
  assertOwner(studio, user);

  const updates: Partial<StudioRecord> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.category !== undefined) updates.category = input.category;
  if (input.description !== undefined) updates.description = input.description;
  if (input.hourlyRate !== undefined) updates.hourlyRate = input.hourlyRate;
  if (input.securityDeposit !== undefined) updates.securityDeposit = input.securityDeposit;
  if (input.maxCapacity !== undefined) updates.maxCapacity = input.maxCapacity;
  if (input.address !== undefined || input.city !== undefined) {
    updates.location = {
      address: input.address ?? studio.location.address,
      city: input.city ?? studio.location.city,
    };
  }
  if (input.imageUrl !== undefined) updates.imageUrl = input.imageUrl;
  if (input.gallery !== undefined) updates.gallery = input.gallery;
  if (input.amenities !== undefined) updates.amenities = input.amenities;
  if (input.equipment !== undefined) updates.equipment = input.equipment;

  await studios().updateOne({ _id: studio._id }, { $set: updates });
  return getStudio(id);
}

/** DELETE /api/studios/:id — owner-only; cleans dependent wishlist/reviews. */
export async function deleteStudio(id: string, user: AuthUser): Promise<void> {
  const studio = await mustFind(id);
  assertOwner(studio, user);

  const db = getDatabase();
  await Promise.all([
    studios().deleteOne({ _id: studio._id }),
    db.collection("wishlist").deleteMany({ studioId: id }),
    db.collection("reviews").deleteMany({ studioId: id }),
    db.collection("booking_slots").deleteMany({ studioId: id }),
  ]);
}

/** GET /api/my-listings — only studios owned by the caller. */
export async function listMyStudios(user: AuthUser): Promise<StudioDto[]> {
  const docs = await studios()
    .find({ ownerId: user.id })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(serializeStudio);
}
