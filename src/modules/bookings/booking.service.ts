import { ObjectId } from "mongodb";
import type { Filter } from "mongodb";
import { getDatabase, isValidObjectId, toObjectId } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import type { AuthUser } from "../../utils/jwt";
import { timeToMinutes } from "../../utils/validators";
import { acquireSlots, releaseSlots } from "./booking.slots";
import type {
  BookingCreateInput,
  BookingStatusInput,
  HostBookingsQueryInput,
} from "./booking.validation";

export type BookingStatus = "Pending" | "Confirmed" | "Completed" | "Cancelled";

export interface BookingRecord {
  _id: ObjectId;
  studioId: string;
  studioTitle: string;
  userId: string;
  userEmail: string;
  userName: string;
  hostId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  startMinute: number;
  endMinute: number;
  duration: number;
  hourlyRate: number;
  securityDeposit: number;
  totalPrice: number;
  status: BookingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type BookingDto = Omit<BookingRecord, "_id"> & { id: string };

export function serializeBooking(doc: BookingRecord): BookingDto {
  const { _id, ...rest } = doc;
  return { id: _id.toHexString(), ...rest };
}

function bookings() {
  return getDatabase().collection<BookingRecord>("bookings");
}

const CONFLICT_MESSAGE =
  "This studio is already booked for the selected time. Please choose another time slot.";

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

/** Client-side cancellation rules (host uses the status endpoint). */
const CLIENT_CANCELLABLE: BookingStatus[] = ["Pending", "Confirmed"];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function mustFind(id: string): Promise<BookingRecord> {
  if (!isValidObjectId(id)) throw ApiError.notFound("Booking not found.");
  const booking = await bookings().findOne({ _id: toObjectId(id) });
  if (!booking) throw ApiError.notFound("Booking not found.");
  return booking;
}

/**
 * Overlap test required by the assignment:
 *   existingStart < requestedEnd AND existingEnd > requestedStart
 * Only *Confirmed* bookings block a requested slot.
 */
async function findConflictingBooking(
  studioId: string,
  bookingDate: string,
  startMinute: number,
  endMinute: number,
  excludeBookingId?: ObjectId
): Promise<BookingRecord | null> {
  const filter: Filter<BookingRecord> = {
    studioId,
    bookingDate,
    status: "Confirmed",
    startMinute: { $lt: endMinute },
    endMinute: { $gt: startMinute },
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };
  return bookings().findOne(filter);
}

/** POST /api/bookings — creates a Pending booking with server pricing. */
export async function createBooking(
  input: BookingCreateInput,
  user: AuthUser
): Promise<BookingDto> {
  const db = getDatabase();
  const studio = await db
    .collection("studios")
    .findOne({ _id: toObjectId(input.studioId) });
  if (!studio) throw ApiError.notFound("Studio not found.");

  const ownerId = typeof studio.ownerId === "string" ? studio.ownerId : "";
  if (ownerId === user.id) {
    throw ApiError.badRequest("You cannot book your own studio.");
  }

  const startMinute = timeToMinutes(input.startTime);
  const endMinute = timeToMinutes(input.endTime);
  if (endMinute <= startMinute) {
    throw ApiError.badRequest("End time must be after start time.");
  }

  const conflict = await findConflictingBooking(
    input.studioId,
    input.bookingDate,
    startMinute,
    endMinute
  );
  if (conflict) throw ApiError.conflict(CONFLICT_MESSAGE);

  const hourlyRate = typeof studio.hourlyRate === "number" ? studio.hourlyRate : 0;
  const securityDeposit =
    typeof studio.securityDeposit === "number" ? studio.securityDeposit : 0;
  const duration = (endMinute - startMinute) / 60;
  const totalPrice = roundMoney(duration * hourlyRate + securityDeposit);

  const now = new Date();
  const doc: BookingRecord = {
    _id: new ObjectId(),
    studioId: input.studioId,
    studioTitle: typeof studio.title === "string" ? studio.title : "Studio",
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    hostId: ownerId,
    bookingDate: input.bookingDate,
    startTime: input.startTime,
    endTime: input.endTime,
    startMinute,
    endMinute,
    duration,
    hourlyRate,
    securityDeposit,
    totalPrice,
    status: "Pending",
    createdAt: now,
    updatedAt: now,
  };

  await bookings().insertOne(doc);
  return serializeBooking(doc);
}

/** GET /api/my-bookings */
export async function listUserBookings(user: AuthUser): Promise<BookingDto[]> {
  const docs = await bookings()
    .find({ userId: user.id })
    .sort({ bookingDate: -1, createdAt: -1 })
    .toArray();
  return docs.map(serializeBooking);
}

/** GET /api/bookings/:id — renter or host only. */
export async function getBooking(id: string, user: AuthUser): Promise<BookingDto> {
  const booking = await mustFind(id);
  if (booking.userId !== user.id && booking.hostId !== user.id) {
    throw ApiError.forbidden("You are not authorized to view this booking.");
  }
  return serializeBooking(booking);
}

/** PATCH /api/bookings/:id/cancel — renter cancels an eligible booking. */
export async function cancelBooking(id: string, user: AuthUser): Promise<BookingDto> {
  const booking = await mustFind(id);
  if (booking.userId !== user.id) {
    throw ApiError.forbidden("You are not authorized to cancel this booking.");
  }
  if (!CLIENT_CANCELLABLE.includes(booking.status)) {
    throw ApiError.badRequest(
      `A ${booking.status.toLowerCase()} booking cannot be cancelled.`
    );
  }

  const wasConfirmed = booking.status === "Confirmed";
  const updated = await bookings().findOneAndUpdate(
    { _id: booking._id, status: { $in: CLIENT_CANCELLABLE } },
    { $set: { status: "Cancelled" as const, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!updated) throw ApiError.badRequest("This booking can no longer be cancelled.");
  if (wasConfirmed) {
    await releaseSlots(booking.studioId, booking.bookingDate, booking.startMinute, booking.endMinute);
  }
  return serializeBooking(updated);
}

/** GET /api/host/bookings — incoming reservations for the caller's studios. */
export async function listHostBookings(
  user: AuthUser,
  query: HostBookingsQueryInput
): Promise<BookingDto[]> {
  const filter: Filter<BookingRecord> = { hostId: user.id };
  if (query.status) filter.status = query.status;
  const docs = await bookings()
    .find(filter)
    .sort({ bookingDate: -1, createdAt: -1 })
    .toArray();
  return docs.map(serializeBooking);
}

/**
 * PATCH /api/host/bookings/:id/status — host confirms/completes/cancels.
 * Pending → Confirmed atomically acquires minute slots (409 on clash).
 */
export async function updateHostBookingStatus(
  id: string,
  nextStatus: BookingStatusInput,
  user: AuthUser
): Promise<BookingDto> {
  const booking = await mustFind(id);
  if (booking.hostId !== user.id) {
    throw ApiError.forbidden("You are not authorized to manage this booking.");
  }

  const allowed = TRANSITIONS[booking.status];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.badRequest(
      `A ${booking.status.toLowerCase()} booking cannot become ${nextStatus.toLowerCase()}.`
    );
  }

  if (booking.status === "Pending" && nextStatus === "Confirmed") {
    const conflict = await findConflictingBooking(
      booking.studioId,
      booking.bookingDate,
      booking.startMinute,
      booking.endMinute,
      booking._id
    );
    if (conflict) throw ApiError.conflict(CONFLICT_MESSAGE);

    const acquired = await acquireSlots(
      booking.studioId,
      booking.bookingDate,
      booking.startMinute,
      booking.endMinute,
      booking._id.toHexString()
    );
    if (!acquired) throw ApiError.conflict(CONFLICT_MESSAGE);

    try {
      const updated = await bookings().findOneAndUpdate(
        { _id: booking._id, status: "Pending" },
        { $set: { status: "Confirmed" as const, updatedAt: new Date() } },
        { returnDocument: "after" }
      );
      if (!updated) throw ApiError.conflict(CONFLICT_MESSAGE);
      return serializeBooking(updated);
    } catch (error) {
      // Compensation: free the slots if the status write failed.
      await releaseSlots(
        booking.studioId,
        booking.bookingDate,
        booking.startMinute,
        booking.endMinute
      ).catch(() => undefined);
      throw error;
    }
  }

  if (booking.status === "Confirmed" && nextStatus === "Cancelled") {
    await releaseSlots(booking.studioId, booking.bookingDate, booking.startMinute, booking.endMinute);
  }

  const updated = await bookings().findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    { $set: { status: nextStatus, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!updated) throw ApiError.conflict(CONFLICT_MESSAGE);
  return serializeBooking(updated);
}
