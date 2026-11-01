import { z } from "zod";
import { STUDIO_CATEGORIES, STUDIO_SORT_OPTIONS } from "./studio.constants";

/** Accepts "" / null / undefined as undefined (query strings send empty values). */
export function emptyToUndefined(value: unknown): unknown {
  return value === "" || value === null || value === undefined ? undefined : value;
}

const optionalString = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(min).max(max).optional()
  );

const imageLike = z
  .string()
  .trim()
  .min(1, "Studio image is required")
  .max(2048, "Image URL is too long");

const imageItem = z.string().trim().min(1).max(2048);

const tagItem = z.string().trim().min(1, "Tags cannot be empty").max(60);

const locationSchema = z.object({
  address: z.string().trim().min(3, "Address is required").max(200),
  city: z.string().trim().min(2, "City is required").max(100),
});

/** Flat input shape used by the Add / Edit studio forms. */
const studioFields = {
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title must be 120 characters or fewer"),
  category: z.enum(STUDIO_CATEGORIES, {
    error: "Please select a valid studio category",
  }),
  description: z
    .string()
    .trim()
    .min(20, "Overview must be at least 20 characters")
    .max(5000, "Overview must be 5000 characters or fewer"),
  hourlyRate: z.coerce
    .number()
    .positive("Hourly rate must be greater than 0")
    .max(10000, "Hourly rate looks unrealistic"),
  securityDeposit: z.coerce
    .number()
    .min(0, "Security deposit cannot be negative")
    .max(100000, "Security deposit looks unrealistic"),
  maxCapacity: z.coerce
    .number()
    .int("Maximum capacity must be a whole number")
    .positive("Maximum capacity must be at least 1")
    .max(1000, "Maximum capacity looks unrealistic"),
  address: z.string().trim().min(3, "Address is required").max(200),
  city: z.string().trim().min(2, "City is required").max(100),
  imageUrl: imageLike,
  gallery: z.array(imageItem).max(10, "Up to 10 gallery images").default([]),
  amenities: z.array(tagItem).max(30, "Up to 30 amenities").default([]),
  equipment: z.array(tagItem).max(30, "Up to 30 equipment items").default([]),
};

export const studioCreateSchema = z.object(studioFields);

/**
 * Edit payload: same rules, everything optional, and NO defaults — a
 * missing key must leave the stored value untouched instead of resetting
 * it to [].
 */
export const studioUpdateSchema = z
  .object({
    title: studioFields.title.optional(),
    category: studioFields.category.optional(),
    description: studioFields.description.optional(),
    hourlyRate: studioFields.hourlyRate.optional(),
    securityDeposit: studioFields.securityDeposit.optional(),
    maxCapacity: studioFields.maxCapacity.optional(),
    address: studioFields.address.optional(),
    city: studioFields.city.optional(),
    imageUrl: studioFields.imageUrl.optional(),
    gallery: z.array(imageItem).max(10).optional(),
    amenities: z.array(tagItem).max(30).optional(),
    equipment: z.array(tagItem).max(30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update",
  });

export type StudioCreateInput = z.infer<typeof studioCreateSchema>;
export type StudioUpdateInput = z.infer<typeof studioUpdateSchema>;

/** GET /api/studios query string. */
export const studioQuerySchema = z.object({
  search: optionalString(200),
  category: z.preprocess(
    emptyToUndefined,
    z.enum(STUDIO_CATEGORIES).optional()
  ),
  city: optionalString(100),
  minPrice: optionalNumber(0, 100000),
  maxPrice: optionalNumber(0, 100000),
  minRating: optionalNumber(0, 5),
  capacity: optionalNumber(1, 1000),
  amenities: z.preprocess(emptyToUndefined, z.string().max(500)).optional(),
  sort: z.preprocess(
    emptyToUndefined,
    z.enum(STUDIO_SORT_OPTIONS).optional()
  ),
  page: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(10000).optional()
  ),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(60).optional()
  ),
});

export type StudioQueryInput = z.infer<typeof studioQuerySchema>;
