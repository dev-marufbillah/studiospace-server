import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import { getValidated, getPathParam } from "../../middleware/validate";
import {
  cancelBooking,
  createBooking,
  getBooking,
  listHostBookings,
  listUserBookings,
  updateHostBookingStatus,
} from "./booking.service";
import type {
  BookingCreateInput,
  HostBookingsQueryInput,
  HostStatusUpdateInput,
} from "./booking.validation";
import type { AuthUser } from "../../utils/jwt";

function requireUser(req: Request): AuthUser {
  if (!req.user) {
    throw new Error("authenticate middleware must run before this handler");
  }
  return req.user;
}

export async function handleCreateBooking(req: Request, res: Response): Promise<void> {
  const input = getValidated<BookingCreateInput>(req, "body");
  const booking = await createBooking(input, requireUser(req));
  sendSuccess(res, "Booking requested successfully. Your booking is pending confirmation.", { booking }, 201);
}

export async function handleMyBookings(req: Request, res: Response): Promise<void> {
  const bookings = await listUserBookings(requireUser(req));
  sendSuccess(res, "Your bookings fetched successfully", { bookings });
}

export async function handleGetBooking(req: Request, res: Response): Promise<void> {
  const booking = await getBooking(getPathParam(req, "id"), requireUser(req));
  sendSuccess(res, "Booking fetched successfully", { booking });
}

export async function handleCancelBooking(req: Request, res: Response): Promise<void> {
  const booking = await cancelBooking(getPathParam(req, "id"), requireUser(req));
  sendSuccess(res, "Booking cancelled successfully", { booking });
}

export async function handleHostBookings(req: Request, res: Response): Promise<void> {
  const query = getValidated<HostBookingsQueryInput>(req, "query");
  const bookings = await listHostBookings(requireUser(req), query);
  sendSuccess(res, "Incoming reservations fetched successfully", { bookings });
}

export async function handleHostStatusUpdate(req: Request, res: Response): Promise<void> {
  const { status } = getValidated<HostStatusUpdateInput>(req, "body");
  const booking = await updateHostBookingStatus(
    getPathParam(req, "id"),
    status,
    requireUser(req)
  );
  sendSuccess(res, "Booking status updated successfully", { booking });
}
