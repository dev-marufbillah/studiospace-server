# StudioSpace — Server (Express API)

REST API for the StudioSpace marketplace: studios, bookings with double-booking prevention,
wishlist, reviews, profiles and image upload. Express 5 + TypeScript + MongoDB (native driver) +
JWT in HTTPOnly cookies.

- **Base URL (dev):** `http://localhost:5001`
- **Base URL (live):** <https://studiospace-api-seven.vercel.app> · health:
  <https://studiospace-api-seven.vercel.app/api/health>
- **Live web app:** <https://studiospace-delta.vercel.app>
- **Stack:** Express 5 · TypeScript · MongoDB 6 driver · Zod · jsonwebtoken · Helmet ·
  express-rate-limit · Vitest + Supertest
- **Vercel entry:** `api/index.js` boots the same Express app per warm instance; `vercel.json`
  rewrites every path to it and forwards the original URL in `?__path=` so routing and query
  strings behave exactly like the long-running server.

---

## Quick start

```bash
npm install --legacy-peer-deps
cp .env.example .env      # fill in MONGODB_URI, JWT_SECRET, INTERNAL_API_SECRET ...
npm run seed              # 12 studios across all 7 categories + 36 demo reviews
npm run dev               # http://localhost:5001/api/health
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest + Supertest against an in-memory MongoDB (41 tests) |
| `npm run seed` | Seed demo data (`-- --force` to clear and re-seed) |

---

## Architecture

```
src/
├── config/        env validation (fail-fast), MongoDB connection, CORS allow-list
├── middleware/    authenticate (JWT), validateRequest (Zod), rateLimit, errorHandler
├── modules/
│   ├── studios/   routes · controller · service · validation
│   ├── bookings/  routes · controller · service (atomic slot locking)
│   ├── wishlist/  routes · controller · service
│   ├── reviews/   routes · controller · service (rating recompute)
│   ├── users/     profile read/update
│   ├── auth/      POST /api/auth/token — session-to-JWT exchange (internal secret)
│   ├── upload/    imgbb proxy (key stays server-side)
│   └── newsletter/ subscribe (upsert on email)
├── utils/         ApiError, ApiResponse, jwt, cookies, asyncHandler, serializers
├── types/         DB + request types (no `any` in the public surface)
├── app.ts         middleware + route mounting + 404 + error handler
└── server.ts      bootstrap, graceful shutdown, index creation
```

Design rules: controllers never trust client-supplied identity or pricing; services own the queries;
every route validates params/query/body with Zod; a single error handler formats every failure.

---

## API endpoints

All responses use the envelope `{ success, message, data? }` (errors: `{ success: false, message, details? }`).

### Studios

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/studios` | public | `search, category, city, minPrice, maxPrice, minRating, capacity, amenities, sort, page, limit` |
| GET | `/api/studios/featured` | public | max 6, sorted by rating then newest |
| GET | `/api/studios/:id` | public | 404 when missing |
| GET | `/api/studios/:id/reviews` | public | newest first |
| POST | `/api/studios/:id/reviews` | JWT | upsert per user; owner gets 400; recomputes rating |
| DELETE | `/api/studios/:id/reviews` | JWT | deletes the caller's review only |
| POST | `/api/studios` | JWT | identity/pricing from session, not body |
| PUT | `/api/studios/:id` | JWT + owner | partial whitelist update |
| DELETE | `/api/studios/:id` | JWT + owner | cascades booking slots |
| GET | `/api/my-listings` | JWT | only the caller's studios |

### Bookings

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/bookings` | JWT | pending booking, overlap → 409, own studio → 400 |
| GET | `/api/my-bookings` | JWT | renter's bookings |
| GET | `/api/bookings/:id` | JWT + party | renter, host or admin |
| PATCH | `/api/bookings/:id/cancel` | JWT + renter | Pending/Confirmed → Cancelled, releases slot |
| GET | `/api/host/bookings` | JWT | host's incoming, optional `?status=` |
| PATCH | `/api/host/bookings/:id/status` | JWT + host | Pending→Confirmed/Cancelled, Confirmed→Completed/Cancelled |

### Wishlist, users, misc

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/wishlist` | JWT |
| POST | `/api/wishlist` | JWT (idempotent — 201 new / 200 existing) |
| DELETE | `/api/wishlist/:studioId` | JWT |
| GET / PATCH | `/api/users/me` | JWT |
| POST | `/api/upload` | JWT (imgbb; 501 when `IMGBB_API_KEY` is unset) |
| POST | `/api/newsletter` | public |
| GET | `/api/health` | public |

### Status codes

`200` ok · `201` created · `400` validation/illegal transition · `401` missing/invalid/expired JWT ·
`403` not the owner/party · `404` unknown resource · `409` booking collision · `429` rate limited ·
`5xx` unexpected (message never leaks internals unless `DEBUG_API_ERRORS=1`).

---

## Database collections

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `studios` | listings | `category`, `ownerId`, `location.city`, `{rating:-1,createdAt:-1}`, text on title/description |
| `bookings` | reservations | `{studioId, bookingDate}`, `userId`, `hostId`, `status` |
| `booking_slots` | one doc per `{studioId}_{date}` holding confirmed time ranges — the atomic lock used for double-booking prevention | `_id` |
| `wishlists` | saved studios | unique `{userId, studioId}`, `userId` |
| `reviews` | ratings | unique `{studioId, userId}`, `studioId` |
| `users` | Better Auth user records (written by the Next.js Better Auth adapter, read for profiles) | `email` |
| `newsletter` | newsletter signups | unique `email` |

Studio document (abridged):

```json
{
  "_id": "ObjectId",
  "title": "Premium Photography Studio",
  "category": "Photo Studio",
  "description": "…",
  "hourlyRate": 50, "securityDeposit": 100, "maxCapacity": 10,
  "location": { "address": "…", "city": "Dhaka" },
  "imageUrl": "https://…", "gallery": ["https://…"],
  "amenities": ["Wi-Fi"], "equipment": ["Softboxes"],
  "ownerId": "<authenticated id>", "ownerEmail": "…", "ownerName": "…",
  "rating": 0, "reviewCount": 0, "createdAt": "Date", "updatedAt": "Date"
}
```

Booking document (abridged):

```json
{
  "_id": "ObjectId", "studioId": "…", "studioTitle": "…",
  "userId": "…", "userEmail": "…", "userName": "…", "hostId": "…",
  "bookingDate": "2026-11-04", "startTime": "10:00", "endTime": "13:00",
  "startMinute": 600, "endMinute": 780, "duration": 3,
  "hourlyRate": 50, "securityDeposit": 100, "totalPrice": 250,
  "status": "Pending", "createdAt": "Date"
}
```

---

## Authentication & JWT security

1. The browser authenticates with **Better Auth** inside Next.js (`/api/auth/*`). Better Auth is the
   single source of truth for identities; this API never stores passwords.
2. Next.js `POST /api/session` verifies that Better Auth session, then calls this API's
   `POST /api/auth/token` with the shared `x-internal-secret` header. Without the header the route
   refuses to mint anything (401) — it can never be triggered from a browser directly.
3. The API issues a signed JWT (`sub`, `email`, `name`, `role`, `iat`, `exp`) and sets it in the
   `studiospace_session` cookie: `HttpOnly`, `SameSite=Lax` (`None` + `Secure` when the client and
   API are on different sites in production), `Secure` in production, max-age from `JWT_EXPIRES_IN`.
4. `authenticate` middleware verifies signature **and** expiry, then loads the user id into
   `req.auth`. Missing/invalid/tampered/expired tokens → `401`.
5. Ownership is re-checked per resource (`403` for studios and bookings that belong to someone else).

Verified behaviours (see the tests and README of the client for the manual script):
`401` without a cookie · `401` tampered signature · `403` another user's studio/booking · `409`
overlapping confirmed booking.

---

## Making a real account the host of the seeded listings

`npm run seed` creates the 12 demo studios under the placeholder owner
`seeded-demo-host`, which nobody can log in as — so bookings on those studios stay
**Pending** forever (only a studio's host can confirm a request). Run:

```bash
npm run make-host -- you@example.com          # reassign the 12 seeded listings
npm run make-host -- you@example.com --all    # reassign every studio
npm run make-host -- you@example.com --dry    # preview, change nothing
```

The account must already exist (`/register`). Afterwards open `/host` (Host Panel)
or `/dashboard` → **Incoming reservations** → *Confirm*, and the renter's booking moves to
**Confirmed** (invoice download becomes available).

## Double-booking prevention

- Overlap rule: `existingStart < requestedEnd && existingEnd > requestedStart`.
- Creation rejects overlap with a **Confirmed** booking (`409`, exact assignment message).
- Confirmation is atomic: one document per `{studioId}_{date}` in `booking_slots`, updated with a
  conditional upsert (`$not` on an overlapping range). A losing concurrent writer either matches no
  document or hits a duplicate-key error on `_id`; the service retries the read and returns `409`.
  No transaction is required, so standalone MongoDB and Atlas both work.
- Cancelling/completing releases the range (`$pull` + `$unset`) with compensation if the follow-up
  booking write fails.
- Pricing is always recomputed server-side: `round2(hours × hourlyRate + securityDeposit)`.

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | yes | default `5001` |
| `NODE_ENV` | yes | `development` / `production` |
| `MONGODB_URI` | yes | Atlas or local |
| `DB_NAME` | yes | e.g. `studiospace` |
| `JWT_SECRET` | yes | 32+ random bytes; startup fails without it |
| `JWT_EXPIRES_IN` | yes | `7d` |
| `JWT_COOKIE_NAME` | yes | `studiospace_session` (must match the client constant) |
| `INTERNAL_API_SECRET` | yes | must equal the client's value |
| `CLIENT_URL` | yes | exact frontend origin for credentialed CORS |
| `IMGBB_API_KEY` | optional | [api.imgbb.com](https://api.imgbb.com/) — uploads return `501` without it |
| `DEBUG_API_ERRORS` | optional | `1` exposes stack traces in dev |

Config is validated at boot (`src/config/env.ts`): a missing secret throws immediately instead of
failing later in production.

---

## Testing

```bash
npm test          # 41 tests: CRUD, auth, ownership, 401/403/404/409, JWT tampering, partial profile update, page-size limits, upload, wishlist, newsletter
npm run typecheck # tsc --noEmit
npm run build     # tsc emit to dist/
```

The suite boots `mongodb-memory-server` (downloads a MongoDB binary on first run) and exercises the
real Express app through Supertest — including a concurrent-request race that must produce exactly
one confirmed booking.

Full end-to-end sweep (needs both dev servers running):

```bash
bash scripts/qa-e2e.sh     # 72 checks: auth, CRUD, booking lifecycle, filters,
                           # wishlist, reviews, profile, newsletter, routes
```

Manual smoke test:

```bash
curl localhost:5001/api/health
curl "localhost:5001/api/studios?category=Photo%20Studio&sort=rating"
curl -X POST localhost:5001/api/studios -H 'Content-Type: application/json' -d '{}'   # → 401
```

---

## Deployment (Render or similar)

1. New **Web Service** → connect the repo → Root directory `studiospace-server`.
2. Build: `npm install --legacy-peer-deps && npm run build` · Start: `npm start`.
3. Add the environment variables above (`NODE_ENV=production`, `CLIENT_URL=https://<vercel-domain>`,
   Atlas URI, fresh secrets).
4. Health check path: `/api/health`.
5. Use a MongoDB Atlas cluster with the API server IP allowed (or `0.0.0.0/0` for evaluation).
6. Cross-site cookies: keep the frontend's `/api/*` rewrite in place (recommended — same-origin
   cookies) or serve both on the same apex domain.

---

## Known limitations

- No payment processing; totals/deposits are recorded, not charged.
- Newsletter emails are stored but nothing is sent (no mail provider configured).
- Reviews are limited to one per user per studio; there is no moderation queue.
- `booking_slots` assumes a single MongoDB deployment; a sharded cluster would need the same
  conditional-upsert pattern reviewed per shard key.
