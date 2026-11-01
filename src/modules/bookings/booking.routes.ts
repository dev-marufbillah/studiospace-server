import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import {
  handleCancelBooking,
  handleCreateBooking,
  handleGetBooking,
  handleHostBookings,
  handleHostStatusUpdate,
  handleMyBookings,
} from "./booking.controller";
import {
  bookingCreateSchema,
  bookingIdParamSchema,
  hostBookingsQuerySchema,
  hostStatusUpdateSchema,
} from "./booking.validation";

/** /api/bookings */
export const bookingRouter = Router();
bookingRouter.post("/", authenticate, validate(bookingCreateSchema), handleCreateBooking);
bookingRouter.get(
  "/:id",
  authenticate,
  validate(bookingIdParamSchema, "params"),
  handleGetBooking
);
bookingRouter.patch(
  "/:id/cancel",
  authenticate,
  validate(bookingIdParamSchema, "params"),
  handleCancelBooking
);

/** /api/my-bookings */
export const myBookingsRouter = Router();
myBookingsRouter.get("/", authenticate, handleMyBookings);

/** /api/host/bookings */
export const hostBookingRouter = Router();
hostBookingRouter.get(
  "/",
  authenticate,
  validate(hostBookingsQuerySchema, "query"),
  handleHostBookings
);
hostBookingRouter.patch(
  "/:id/status",
  authenticate,
  validate(bookingIdParamSchema, "params"),
  validate(hostStatusUpdateSchema),
  handleHostStatusUpdate
);
