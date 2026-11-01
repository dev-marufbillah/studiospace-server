import { z } from "zod";
import { isValidCalendarDate, isPastDate, TIME_PATTERN } from "../../utils/validators";

/**
 * Booking creation payload. Pricing (duration, hourly rate, deposit,
 * total) is always recomputed on the server from the stored studio —
 * client-supplied prices are never trusted.
 */
export const bookingCreateSchema = z
  .object({
    studioId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid studio id"),
    bookingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Booking date must be YYYY-MM-DD")
      .refine(isValidCalendarDate, "That booking date does not exist")
      .refine((value) => !isPastDate(value), "Booking date cannot be in the past"),
    startTime: z.string().regex(TIME_PATTERN, "Start time must be HH:MM"),
    endTime: z.string().regex(TIME_PATTERN, "End time must be HH:MM"),
  })
  .refine((value) => value.endTime > value.startTime, {
    error: "End time must be after start time",
    path: ["endTime"],
  });

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const bookingStatusSchema = z.enum(
  ["Pending", "Confirmed", "Completed", "Cancelled"],
  { error: "Invalid booking status" }
);
export type BookingStatusInput = z.infer<typeof bookingStatusSchema>;

export const hostStatusUpdateSchema = z.object({
  status: bookingStatusSchema,
});
export type HostStatusUpdateInput = z.infer<typeof hostStatusUpdateSchema>;

export const hostBookingsQuerySchema = z.object({
  status: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    bookingStatusSchema.optional()
  ),
});
export type HostBookingsQueryInput = z.infer<typeof hostBookingsQuerySchema>;

export const bookingIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid booking id"),
});
