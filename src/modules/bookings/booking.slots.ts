import { MongoServerError } from "mongodb";
import type { Collection, Document } from "mongodb";
import { getDatabase } from "../../config/database";

/**
 * Double-booking prevention (Challenge 1).
 *
 * Every *Confirmed* booking claims one document slot per minute of its
 * range inside `booking_slots`, keyed by `${studioId}_${bookingDate}`.
 * Because MongoDB guarantees single-document atomicity, the conditional
 * `updateOne` below is an all-or-nothing reservation: if any minute of
 * the requested range is already taken, `matchedCount` is 0 and the
 * caller receives HTTP 409. Simultaneous confirmations therefore can
 * never produce overlapping Confirmed bookings — no transactions or
 * replica set required (works on standalone MongoDB and Atlas alike).
 */

export interface BookingSlotRecord extends Document {
  _id: string; // `${studioId}_${bookingDate}`
  studioId: string;
  bookingDate: string;
  /** minute-since-midnight -> booking id holding that minute */
  slots: Record<string, string>;
}

export function slotDocumentId(studioId: string, bookingDate: string): string {
  return `${studioId}_${bookingDate}`;
}

/** Every minute covered by [startMinute, endMinute). */
export function minuteKeys(startMinute: number, endMinute: number): string[] {
  const keys: string[] = [];
  for (let minute = startMinute; minute < endMinute; minute += 1) {
    keys.push(String(minute));
  }
  return keys;
}

function slotsCollection(): Collection<BookingSlotRecord> {
  return getDatabase().collection<BookingSlotRecord>("booking_slots");
}

/**
 * Atomically claims every minute of the range for `bookingId`.
 * Returns false when any minute is already occupied (→ HTTP 409).
 */
export async function acquireSlots(
  studioId: string,
  bookingDate: string,
  startMinute: number,
  endMinute: number,
  bookingId: string
): Promise<boolean> {
  const keys = minuteKeys(startMinute, endMinute);
  if (keys.length === 0) return false;

  const setFields: Record<string, string> = {};
  for (const key of keys) setFields[`slots.${key}`] = bookingId;

  const filter = {
    _id: slotDocumentId(studioId, bookingDate),
    $and: keys.map((key) => ({ [`slots.${key}`]: { $exists: false } })),
  };

  try {
    const result = await slotsCollection().updateOne(
      filter,
      { $set: setFields },
      { upsert: true }
    );
    return result.matchedCount > 0 || result.upsertedCount > 0;
  } catch (error) {
    // Two upserts raced on the same _id — retry once as a plain update.
    if (error instanceof MongoServerError && error.code === 11000) {
      const retry = await slotsCollection().updateOne(filter, { $set: setFields });
      return retry.matchedCount > 0;
    }
    throw error;
  }
}

/** Frees every minute previously claimed by a booking. */
export async function releaseSlots(
  studioId: string,
  bookingDate: string,
  startMinute: number,
  endMinute: number
): Promise<void> {
  const keys = minuteKeys(startMinute, endMinute);
  if (keys.length === 0) return;
  const unsetFields: Record<string, ""> = {};
  for (const key of keys) unsetFields[`slots.${key}`] = "";
  await slotsCollection().updateOne(
    { _id: slotDocumentId(studioId, bookingDate) },
    { $unset: unsetFields }
  );
}
