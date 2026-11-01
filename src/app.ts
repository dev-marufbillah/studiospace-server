import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOptions } from "./config/cors";
import { apiLimiter, authExchangeLimiter } from "./middleware/rateLimiter";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { sendSuccess } from "./utils/ApiResponse";
import { authRouter } from "./modules/auth/auth.routes";
import { myListingsRouter, studioRouter } from "./modules/studios/studio.routes";
import {
  bookingRouter,
  hostBookingRouter,
  myBookingsRouter,
} from "./modules/bookings/booking.routes";
import { wishlistRouter } from "./modules/wishlist/wishlist.routes";
import { reviewRouter } from "./modules/reviews/review.routes";
import { userRouter } from "./modules/users/user.routes";
import { uploadRouter } from "./modules/upload/upload.routes";
import { newsletterRouter } from "./modules/newsletter/newsletter.routes";

/** Builds the Express application (exported for tests). */
export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  // Required behind Render's reverse proxy for correct client IPs
  // (rate limiting) and secure cookie behaviour.
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "8mb" }));
  app.use(cookieParser());

  app.use("/api", apiLimiter);

  app.get("/api/health", (_req, res) => {
    sendSuccess(res, "StudioSpace API is healthy", {
      status: "ok",
      uptime: process.uptime(),
    });
  });

  // Server-to-server token exchange (shared INTERNAL_API_SECRET).
  app.use("/api/auth", authExchangeLimiter, authRouter);

  app.use("/api/studios", studioRouter);
  app.use("/api/my-listings", myListingsRouter);
  app.use("/api/bookings", bookingRouter);
  app.use("/api/my-bookings", myBookingsRouter);
  app.use("/api/host/bookings", hostBookingRouter);
  app.use("/api/wishlist", wishlistRouter);
  app.use("/api/users", userRouter);
  app.use("/api/upload", uploadRouter);
  app.use("/api/newsletter", newsletterRouter);
  // Review routes carry their own /studios/:id/reviews paths.
  app.use("/api", reviewRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
