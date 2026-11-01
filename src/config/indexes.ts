import type { Db } from "mongodb";

/**
 * Creates the indexes required by the assignment. Safe to run on every
 * boot (createIndex is idempotent).
 */
export async function ensureIndexes(db: Db): Promise<void> {
  const studios = db.collection("studios");
  const bookings = db.collection("bookings");
  const wishlist = db.collection("wishlist");
  const reviews = db.collection("reviews");

  await Promise.all([
    studios.createIndex({ category: 1 }),
    studios.createIndex({ ownerId: 1 }),
    studios.createIndex({ "location.city": 1 }),
    studios.createIndex({ rating: -1, createdAt: -1 }),
    studios.createIndex({ hourlyRate: 1 }),
    studios.createIndex({ title: 1 }),
    bookings.createIndex({ studioId: 1, bookingDate: 1 }),
    bookings.createIndex({ userId: 1 }),
    bookings.createIndex({ hostId: 1 }),
    bookings.createIndex({ studioId: 1, status: 1, startMinute: 1, endMinute: 1 }),
    wishlist.createIndex({ userId: 1, studioId: 1 }, { unique: true }),
    reviews.createIndex({ studioId: 1 }),
    reviews.createIndex({ studioId: 1, userId: 1 }, { unique: true }),
    reviews.createIndex({ userId: 1 }),
  ]);
}
