import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Response } from "supertest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app";
import { closeDatabase, connectDatabase } from "../src/config/database";
import { ensureIndexes } from "../src/config/indexes";
import { env } from "../src/config/env";
import { stopTestMongo } from "./setup";

const app = createApp();
let db: Db;

interface TestUser {
  id: string;
  email: string;
  name: string;
}

function authHeader(token: string): Record<string, string> {
  return { Cookie: `${env.JWT_COOKIE_NAME}=${token}` };
}

async function createUser(name: string, email: string): Promise<TestUser> {
  const _id = new ObjectId();
  await db.collection("users").insertOne({
    _id,
    name,
    email,
    image: null,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: _id.toHexString(), email, name };
}

async function mintToken(user: TestUser): Promise<string> {
  const res: Response = await request(app)
    .post("/api/auth/token")
    .set("X-Internal-Secret", env.INTERNAL_API_SECRET)
    .send({ userId: user.id, email: user.email, name: user.name });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function studioPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Luminous Photo Studio",
    category: "Photo Studio",
    description:
      "A bright daylight photo studio with blackout curtains, cyc wall and grip gear included for full-day shoots.",
    hourlyRate: 50,
    securityDeposit: 100,
    maxCapacity: 12,
    address: "12 Lakeview Road, Banani",
    city: "Dhaka",
    imageUrl: "https://cdn.example.com/studios/luminous.jpg",
    gallery: ["https://cdn.example.com/studios/luminous-2.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning"],
    equipment: ["Softboxes", "C-Stands"],
    ...overrides,
  };
}

async function createStudioAs(host: TestUser, token: string, overrides: Record<string, unknown> = {}) {
  const res: Response = await request(app)
    .post("/api/studios")
    .set(authHeader(token))
    .send(studioPayload(overrides));
  expect(res.status).toBe(201);
  return res.body.data.studio as { id: string; title: string; gallery: string[] };
}

const FUTURE_DATE = "2030-05-20";

async function createBookingAs(
  renter: TestUser,
  token: string,
  studioId: string,
  overrides: Record<string, unknown> = {}
) {
  const res: Response = await request(app)
    .post("/api/bookings")
    .set(authHeader(token))
    .send({
      studioId,
      bookingDate: FUTURE_DATE,
      startTime: "10:00",
      endTime: "13:00",
      ...overrides,
    });
  return res;
}

beforeAll(async () => {
  db = await connectDatabase();
  await ensureIndexes(db);
});

afterAll(async () => {
  await closeDatabase();
  await stopTestMongo();
});

beforeEach(async () => {
  const collections = ["users", "studios", "bookings", "wishlist", "reviews", "booking_slots"];
  await Promise.all(collections.map((name) => db.collection(name).deleteMany({})));
});

describe("health & error envelope", () => {
  it("GET /api/health returns the success envelope", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: expect.any(String) });
    expect(res.body.data.status).toBe("ok");
  });

  it("unknown routes return a JSON 404 envelope", async () => {
    const res = await request(app).get("/api/definitely-missing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: expect.any(String) });
  });

  it("serves CORS headers for the exact configured origin only", async () => {
    const allowed = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:3000");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const denied = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("JWT token exchange (server-to-server)", () => {
  it("rejects a missing or wrong internal secret with 401", async () => {
    const noSecret = await request(app)
      .post("/api/auth/token")
      .send({ userId: "u1", email: "a@b.com", name: "A" });
    expect(noSecret.status).toBe(401);

    const wrongSecret = await request(app)
      .post("/api/auth/token")
      .set("X-Internal-Secret", "not-the-right-secret-value-here")
      .send({ userId: "u1", email: "a@b.com", name: "A" });
    expect(wrongSecret.status).toBe(401);
    expect(wrongSecret.body.success).toBe(false);
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await request(app)
      .post("/api/auth/token")
      .set("X-Internal-Secret", env.INTERNAL_API_SECRET)
      .send({ userId: "", email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("issues a verifiable JWT for valid input", async () => {
    const user = await createUser("Nadia Rahman", "nadia@example.com");
    const token = await mintToken(user);
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    expect(typeof decoded === "object" && decoded.sub).toBe(user.id);
  });
});

describe("authentication on protected mutations", () => {
  it("rejects missing JWT with 401", async () => {
    const res = await request(app).post("/api/studios").send(studioPayload());
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects a garbage token with 401", async () => {
    const res = await request(app)
      .post("/api/studios")
      .set(authHeader("not-a-jwt-at-all"))
      .send(studioPayload());
    expect(res.status).toBe(401);
  });

  it("rejects a tampered token with 401", async () => {
    const user = await createUser("Tamper Test", "tamper@example.com");
    const token = await mintToken(user);
    const tampered = `${token.slice(0, -3)}xyz`;
    const res = await request(app)
      .post("/api/studios")
      .set(authHeader(tampered))
      .send(studioPayload());
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret with 401", async () => {
    const user = await createUser("Wrong Secret", "wrong@example.com");
    const forged = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      "completely-different-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );
    const res = await request(app)
      .post("/api/studios")
      .set(authHeader(forged))
      .send(studioPayload());
    expect(res.status).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const user = await createUser("Expired User", "expired@example.com");
    const expired = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      env.JWT_SECRET,
      { algorithm: "HS256" }
    );
    const res = await request(app)
      .post("/api/studios")
      .set(authHeader(expired))
      .send(studioPayload());
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it("accepts the token as an Authorization Bearer header too", async () => {
    const user = await createUser("Bearer User", "bearer@example.com");
    const token = await mintToken(user);
    const res = await request(app)
      .post("/api/studios")
      .set("Authorization", `Bearer ${token}`)
      .send(studioPayload());
    expect(res.status).toBe(201);
  });
});

describe("studio CRUD & authorization", () => {
  it("creates a studio with identity derived from the JWT (not the body)", async () => {
    const host = await createUser("Host One", "host1@example.com");
    const token = await mintToken(host);
    const res = await request(app)
      .post("/api/studios")
      .set(authHeader(token))
      .send({
        ...studioPayload(),
        ownerId: "spoofed-owner",
        ownerEmail: "spoofed@example.com",
        ownerName: "Spoofed",
        rating: 5,
        reviewCount: 99,
      });

    expect(res.status).toBe(201);
    const studio = res.body.data.studio;
    expect(studio.ownerId).toBe(host.id);
    expect(studio.ownerEmail).toBe(host.email);
    expect(studio.ownerName).toBe(host.name);
    expect(studio.rating).toBe(0);
    expect(studio.reviewCount).toBe(0);
  });

  it("validates required fields with 400 + details", async () => {
    const host = await createUser("Host Two", "host2@example.com");
    const token = await mintToken(host);
    const res = await request(app)
      .post("/api/studios")
      .set(authHeader(token))
      .send({ title: "x" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it("rejects an unknown category with 400", async () => {
    const host = await createUser("Host Three", "host3@example.com");
    const token = await mintToken(host);
    const res = await request(app)
      .post("/api/studios")
      .set(authHeader(token))
      .send(studioPayload({ category: "Hovercraft Bay" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown or malformed studio id", async () => {
    expect((await request(app).get("/api/studios/64b000000000000000000000")).status).toBe(404);
    expect((await request(app).get("/api/studios/not-an-id")).status).toBe(404);
  });

  it("forbids updating or deleting another user's studio (403)", async () => {
    const host = await createUser("Owner", "owner@example.com");
    const intruder = await createUser("Intruder", "intruder@example.com");
    const hostToken = await mintToken(host);
    const intruderToken = await mintToken(intruder);
    const studio = await createStudioAs(host, hostToken);

    const update = await request(app)
      .put(`/api/studios/${studio.id}`)
      .set(authHeader(intruderToken))
      .send({ title: "Hijacked Title" });
    expect(update.status).toBe(403);

    const remove = await request(app)
      .delete(`/api/studios/${studio.id}`)
      .set(authHeader(intruderToken));
    expect(remove.status).toBe(403);

    const stillThere = await request(app).get(`/api/studios/${studio.id}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.data.studio.title).toBe("Luminous Photo Studio");
  });

  it("lets the owner update fields without wiping omitted arrays", async () => {
    const host = await createUser("Owner Edit", "edit@example.com");
    const token = await mintToken(host);
    const studio = await createStudioAs(host, token);

    const res = await request(app)
      .put(`/api/studios/${studio.id}`)
      .set(authHeader(token))
      .send({ title: "Renamed Studio", hourlyRate: 65 });

    expect(res.status).toBe(200);
    expect(res.body.data.studio.title).toBe("Renamed Studio");
    expect(res.body.data.studio.hourlyRate).toBe(65);
    expect(res.body.data.studio.gallery).toEqual(studio.gallery);
    expect(res.body.data.studio.amenities).toContain("Wi-Fi");
  });

  it("deletes a studio as the owner and cleans wishlist rows", async () => {
    const host = await createUser("Deleter", "delete@example.com");
    const fan = await createUser("Fan", "fan@example.com");
    const hostToken = await mintToken(host);
    const fanToken = await mintToken(fan);
    const studio = await createStudioAs(host, hostToken);

    await request(app)
      .post("/api/wishlist")
      .set(authHeader(fanToken))
      .send({ studioId: studio.id });

    const res = await request(app)
      .delete(`/api/studios/${studio.id}`)
      .set(authHeader(hostToken));
    expect(res.status).toBe(200);

    expect((await request(app).get(`/api/studios/${studio.id}`)).status).toBe(404);
    const wishlist = await request(app).get("/api/wishlist").set(authHeader(fanToken));
    expect(wishlist.body.data.items).toHaveLength(0);
  });

  it("lists only the caller's studios in /api/my-listings", async () => {
    const hostA = await createUser("Host A", "a@example.com");
    const hostB = await createUser("Host B", "b@example.com");
    const tokenA = await mintToken(hostA);
    const tokenB = await mintToken(hostB);
    await createStudioAs(hostA, tokenA, { title: "Studio A" });
    await createStudioAs(hostB, tokenB, { title: "Studio B" });

    const mine = await request(app).get("/api/my-listings").set(authHeader(tokenA));
    expect(mine.status).toBe(200);
    expect(mine.body.data.studios).toHaveLength(1);
    expect(mine.body.data.studios[0].title).toBe("Studio A");
  });

  it("supports search, filters, sorting and pagination", async () => {
    const host = await createUser("Seeder", "seeder@example.com");
    const token = await mintToken(host);
    await createStudioAs(host, token, { title: "Golden Hour Photo Room", hourlyRate: 30, city: "Chattogram" });
    await createStudioAs(host, token, { title: "Midnight Sound Stage", category: "Sound Stage", hourlyRate: 90, city: "Dhaka" });
    await createStudioAs(host, token, { title: "Cozy Podcast Corner", category: "Podcast Room", hourlyRate: 20, city: "Sylhet" });

    const search = await request(app).get("/api/studios?search=Golden%20Hour");
    expect(search.status).toBe(200);
    expect(search.body.data.studios).toHaveLength(1);

    const byCategory = await request(app).get("/api/studios?category=Podcast%20Room");
    expect(byCategory.body.data.studios).toHaveLength(1);
    expect(byCategory.body.data.studios[0].category).toBe("Podcast Room");

    const byPrice = await request(app).get("/api/studios?minPrice=25&maxPrice=50");
    expect(byPrice.body.data.studios).toHaveLength(1);
    expect(byPrice.body.data.studios[0].hourlyRate).toBe(30);

    const sorted = await request(app).get("/api/studios?sort=price-desc");
    expect(sorted.body.data.studios[0].hourlyRate).toBe(90);

    const paged = await request(app).get("/api/studios?limit=2&page=2");
    expect(paged.body.data.studios).toHaveLength(1);
    expect(paged.body.data.pagination).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });

    const byCity = await request(app).get("/api/studios?city=dhaka");
    expect(byCity.body.data.studios).toHaveLength(1);
  });

  it("returns at most 6 featured studios ordered by rating", async () => {
    const host = await createUser("Feature Host", "feature@example.com");
    const token = await mintToken(host);
    for (let i = 1; i <= 8; i += 1) {
      await createStudioAs(host, token, {
        title: `Featured Studio ${i}`,
        category: "Photo Studio",
      });
    }
    const docs = await db.collection("studios").find({}).toArray();
    for (const [index, doc] of docs.entries()) {
      await db
        .collection("studios")
        .updateOne({ _id: doc._id }, { $set: { rating: index % 7 } });
    }

    const res = await request(app).get("/api/studios/featured");
    expect(res.status).toBe(200);
    expect(res.body.data.studios.length).toBe(6);
    const ratings = res.body.data.studios.map((s: { rating: number }) => s.rating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });
});

describe("booking lifecycle & double-booking prevention", () => {
  it("computes pricing on the server (duration * rate + deposit)", async () => {
    const host = await createUser("Booking Host", "bhost@example.com");
    const renter = await createUser("Renter", "renter@example.com");
    const hostToken = await mintToken(host);
    const renterToken = await mintToken(renter);
    const studio = await createStudioAs(host, hostToken);

    const res = await createBookingAs(renter, renterToken, studio.id, {
      startTime: "10:00",
      endTime: "13:00",
      totalPrice: 1, // spoofed client price must be ignored
      hourlyRate: 1,
    });

    expect(res.status).toBe(201);
    const booking = res.body.data.booking;
    expect(booking.duration).toBe(3);
    expect(booking.hourlyRate).toBe(50);
    expect(booking.securityDeposit).toBe(100);
    expect(booking.totalPrice).toBe(250);
    expect(booking.status).toBe("Pending");
    expect(booking.userId).toBe(renter.id);
    expect(booking.hostId).toBe(host.id);
  });

  it("rejects booking your own studio, past dates and inverted times", async () => {
    const host = await createUser("Self Book", "self@example.com");
    const hostToken = await mintToken(host);
    const studio = await createStudioAs(host, hostToken);

    const own = await createBookingAs(host, hostToken, studio.id);
    expect(own.status).toBe(400);

    const past = await createBookingAs(host, hostToken, studio.id, { bookingDate: "2020-01-01" });
    expect(past.status).toBe(400);

    const inverted = await createBookingAs(host, hostToken, studio.id, {
      startTime: "14:00",
      endTime: "12:00",
    });
    expect(inverted.status).toBe(400);

    const garbageDate = await createBookingAs(host, hostToken, studio.id, { bookingDate: "2030-02-31" });
    expect(garbageDate.status).toBe(400);
  });

  it("rejects creation when a Confirmed booking overlaps (409)", async () => {
    const host = await createUser("Overlap Host", "ohost@example.com");
    const alice = await createUser("Alice", "alice@example.com");
    const bob = await createUser("Bob", "bob@example.com");
    const hostToken = await mintToken(host);
    const aliceToken = await mintToken(alice);
    const bobToken = await mintToken(bob);
    const studio = await createStudioAs(host, hostToken);

    const first = await createBookingAs(alice, aliceToken, studio.id);
    expect(first.status).toBe(201);
    const confirm = await request(app)
      .patch(`/api/host/bookings/${first.body.data.booking.id}/status`)
      .set(authHeader(hostToken))
      .send({ status: "Confirmed" });
    expect(confirm.status).toBe(200);

    const overlapping = await createBookingAs(bob, bobToken, studio.id, {
      startTime: "12:00",
      endTime: "14:00",
    });
    expect(overlapping.status).toBe(409);
    expect(overlapping.body.message).toMatch(/already booked/i);
  });

  it("prevents two simultaneous confirmations from overlapping (atomic slots)", async () => {
    const host = await createUser("Race Host", "race@example.com");
    const alice = await createUser("Race Alice", "ralice@example.com");
    const bob = await createUser("Race Bob", "rbob@example.com");
    const hostToken = await mintToken(host);
    const aliceToken = await mintToken(alice);
    const bobToken = await mintToken(bob);
    const studio = await createStudioAs(host, hostToken);

    const a = await createBookingAs(alice, aliceToken, studio.id, {
      startTime: "09:00",
      endTime: "11:00",
    });
    const b = await createBookingAs(bob, bobToken, studio.id, {
      startTime: "10:00",
      endTime: "12:00",
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201); // both Pending is allowed by the spec

    const [ra, rb] = await Promise.all([
      request(app)
        .patch(`/api/host/bookings/${a.body.data.booking.id}/status`)
        .set(authHeader(hostToken))
        .send({ status: "Confirmed" }),
      request(app)
        .patch(`/api/host/bookings/${b.body.data.booking.id}/status`)
        .set(authHeader(hostToken))
        .send({ status: "Confirmed" }),
    ]);

    const statuses = [ra.status, rb.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 409]);

    const winnerCreate = ra.status === 200 ? a : b;
    const loserCreate = ra.status === 200 ? b : a;
    const loserConfirm = ra.status === 200 ? rb : ra;
    expect(loserConfirm.status).toBe(409);

    // After cancelling the winner, the loser's slot becomes available again.
    const winnerIsAlice = winnerCreate === a;
    const cancel = await request(app)
      .patch(`/api/bookings/${winnerCreate.body.data.booking.id}/cancel`)
      .set(authHeader(winnerIsAlice ? aliceToken : bobToken));
    expect(cancel.status).toBe(200);

    const retry = await request(app)
      .patch(`/api/host/bookings/${loserCreate.body.data.booking.id}/status`)
      .set(authHeader(hostToken))
      .send({ status: "Confirmed" });
    expect(retry.status).toBe(200);
  });

  it("allows non-overlapping bookings on the same day", async () => {
    const host = await createUser("Day Host", "dayhost@example.com");
    const alice = await createUser("Day Alice", "dalice@example.com");
    const bob = await createUser("Day Bob", "dbob@example.com");
    const hostToken = await mintToken(host);
    const aliceToken = await mintToken(alice);
    const bobToken = await mintToken(bob);
    const studio = await createStudioAs(host, hostToken);

    const morning = await createBookingAs(alice, aliceToken, studio.id, {
      startTime: "09:00",
      endTime: "11:00",
    });
    await request(app)
      .patch(`/api/host/bookings/${morning.body.data.booking.id}/status`)
      .set(authHeader(hostToken))
      .send({ status: "Confirmed" });

    const afternoon = await createBookingAs(bob, bobToken, studio.id, {
      startTime: "11:00",
      endTime: "13:00",
    });
    expect(afternoon.status).toBe(201);
  });

  it("restricts booking views and cancellation to the renter", async () => {
    const host = await createUser("View Host", "vhost@example.com");
    const alice = await createUser("View Alice", "valice@example.com");
    const mallory = await createUser("Mallory", "mallory@example.com");
    const hostToken = await mintToken(host);
    const aliceToken = await mintToken(alice);
    const malloryToken = await mintToken(mallory);
    const studio = await createStudioAs(host, hostToken);
    const bookingRes = await createBookingAs(alice, aliceToken, studio.id);
    const bookingId = bookingRes.body.data.booking.id;

    const view = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(malloryToken));
    expect(view.status).toBe(403);

    const cancel = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set(authHeader(malloryToken));
    expect(cancel.status).toBe(403);

    // The host may view but not renter-cancel on the renter's behalf.
    const hostView = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(hostToken));
    expect(hostView.status).toBe(200);
  });

  it("enforces valid status transitions and releases slots on cancel", async () => {
    const host = await createUser("Flow Host", "fhost@example.com");
    const alice = await createUser("Flow Alice", "falice@example.com");
    const hostToken = await mintToken(host);
    const aliceToken = await mintToken(alice);
    const studio = await createStudioAs(host, hostToken);
    const bookingRes = await createBookingAs(alice, aliceToken, studio.id);
    const bookingId = bookingRes.body.data.booking.id;

    // Pending -> Completed is not allowed (must confirm first).
    const bad = await request(app)
      .patch(`/api/host/bookings/${bookingId}/status`)
      .set(authHeader(hostToken))
      .send({ status: "Completed" });
    expect(bad.status).toBe(400);

    const confirm = await request(app)
      .patch(`/api/host/bookings/${bookingId}/status`)
      .set(authHeader(hostToken))
      .send({ status: "Confirmed" });
    expect(confirm.status).toBe(200);

    // A renter cannot use the host status endpoint.
    const renterAttempt = await request(app)
      .patch(`/api/host/bookings/${bookingId}/status`)
      .set(authHeader(aliceToken))
      .send({ status: "Completed" });
    expect(renterAttempt.status).toBe(403);

    const complete = await request(app)
      .patch(`/api/host/bookings/${bookingId}/status`)
      .set(authHeader(hostToken))
      .send({ status: "Completed" });
    expect(complete.status).toBe(200);

    // Completed bookings are terminal.
    const cancelCompleted = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set(authHeader(aliceToken));
    expect(cancelCompleted.status).toBe(400);
  });

  it("keeps /api/my-bookings isolated per user", async () => {
    const host = await createUser("Iso Host", "ihost@example.com");
    const alice = await createUser("Iso Alice", "ialice@example.com");
    const bob = await createUser("Iso Bob", "ibob@example.com");
    const hostToken = await mintToken(host);
    const aliceToken = await mintToken(alice);
    const bobToken = await mintToken(bob);
    const studio = await createStudioAs(host, hostToken);
    await createBookingAs(alice, aliceToken, studio.id);
    await createBookingAs(bob, bobToken, studio.id, { startTime: "14:00", endTime: "16:00" });

    const aliceBookings = await request(app).get("/api/my-bookings").set(authHeader(aliceToken));
    expect(aliceBookings.body.data.bookings).toHaveLength(1);
    expect(aliceBookings.body.data.bookings[0].userEmail).toBe(alice.email);

    const hostInbox = await request(app).get("/api/host/bookings").set(authHeader(hostToken));
    expect(hostInbox.body.data.bookings).toHaveLength(2);
  });
});

describe("wishlist", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/wishlist");
    expect(res.status).toBe(401);
  });

  it("adds, lists and removes studios", async () => {
    const host = await createUser("Wish Host", "whost@example.com");
    const fan = await createUser("Wish Fan", "fan@example.com");
    const hostToken = await mintToken(host);
    const fanToken = await mintToken(fan);
    const studio = await createStudioAs(host, hostToken);

    const add = await request(app)
      .post("/api/wishlist")
      .set(authHeader(fanToken))
      .send({ studioId: studio.id });
    expect(add.status).toBe(201);

    const again = await request(app)
      .post("/api/wishlist")
      .set(authHeader(fanToken))
      .send({ studioId: studio.id });
    expect(again.status).toBe(200);
    expect(again.body.data.added).toBe(false);

    const list = await request(app).get("/api/wishlist").set(authHeader(fanToken));
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].studio.id).toBe(studio.id);

    const remove = await request(app)
      .delete(`/api/wishlist/${studio.id}`)
      .set(authHeader(fanToken));
    expect(remove.status).toBe(200);

    const empty = await request(app).get("/api/wishlist").set(authHeader(fanToken));
    expect(empty.body.data.items).toHaveLength(0);
  });

  it("404s when wishlisting an unknown studio", async () => {
    const fan = await createUser("Wish Fan 2", "fan2@example.com");
    const fanToken = await mintToken(fan);
    const res = await request(app)
      .post("/api/wishlist")
      .set(authHeader(fanToken))
      .send({ studioId: "64b000000000000000000000" });
    expect(res.status).toBe(404);
  });
});

describe("reviews & rating aggregate", () => {
  it("creates reviews, recomputes studio rating and blocks the owner", async () => {
    const host = await createUser("Review Host", "rhost@example.com");
    const alice = await createUser("Reviewer Alice", "ralice2@example.com");
    const bob = await createUser("Reviewer Bob", "rbob2@example.com");
    const hostToken = await mintToken(host);
    const aliceToken = await mintToken(alice);
    const bobToken = await mintToken(bob);
    const studio = await createStudioAs(host, hostToken);

    const ownerReview = await request(app)
      .post(`/api/studios/${studio.id}/reviews`)
      .set(authHeader(hostToken))
      .send({ rating: 5, comment: "I love my own studio" });
    expect(ownerReview.status).toBe(400);

    const first = await request(app)
      .post(`/api/studios/${studio.id}/reviews`)
      .set(authHeader(aliceToken))
      .send({ rating: 4, comment: "Great light and friendly host." });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/studios/${studio.id}/reviews`)
      .set(authHeader(bobToken))
      .send({ rating: 5, comment: "Would shoot here again, wonderful acoustics." });
    expect(second.status).toBe(201);

    const studioAfter = await request(app).get(`/api/studios/${studio.id}`);
    expect(studioAfter.body.data.studio.reviewCount).toBe(2);
    expect(studioAfter.body.data.studio.rating).toBe(4.5);

    // Upsert: Alice revises her review instead of adding a second one.
    const revise = await request(app)
      .post(`/api/studios/${studio.id}/reviews`)
      .set(authHeader(aliceToken))
      .send({ rating: 5, comment: "Revised: even better on the second visit." });
    expect(revise.status).toBe(201);
    const list = await request(app).get(`/api/studios/${studio.id}/reviews`);
    expect(list.body.data.reviews).toHaveLength(2);

    const deleteAlice = await request(app)
      .delete(`/api/studios/${studio.id}/reviews`)
      .set(authHeader(aliceToken));
    expect(deleteAlice.status).toBe(200);

    const afterDelete = await request(app).get(`/api/studios/${studio.id}`);
    expect(afterDelete.body.data.studio.reviewCount).toBe(1);
    expect(afterDelete.body.data.studio.rating).toBe(5);

    const deleteAgain = await request(app)
      .delete(`/api/studios/${studio.id}/reviews`)
      .set(authHeader(aliceToken));
    expect(deleteAgain.status).toBe(404);
  });

  it("rejects invalid ratings", async () => {
    const host = await createUser("Rating Host", "rh@example.com");
    const fan = await createUser("Rating Fan", "rf@example.com");
    const hostToken = await mintToken(host);
    const fanToken = await mintToken(fan);
    const studio = await createStudioAs(host, hostToken);

    const res = await request(app)
      .post(`/api/studios/${studio.id}/reviews`)
      .set(authHeader(fanToken))
      .send({ rating: 9, comment: "Too high" });
    expect(res.status).toBe(400);
  });
});

describe("user profile", () => {
  it("returns the caller's profile and updates name/image", async () => {
    const user = await createUser("Profile User", "profile@example.com");
    const token = await mintToken(user);

    const me = await request(app).get("/api/users/me").set(authHeader(token));
    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({ id: user.id, email: user.email, name: user.name });

    const updated = await request(app)
      .patch("/api/users/me")
      .set(authHeader(token))
      .send({ name: "Profile Updated", image: "https://cdn.example.com/avatar.png" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.user.name).toBe("Profile Updated");
    expect(updated.body.data.user.image).toBe("https://cdn.example.com/avatar.png");

    const stored = await db.collection("users").findOne({ _id: new ObjectId(user.id) });
    expect(stored?.name).toBe("Profile Updated");
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/users/me")).status).toBe(401);
    expect((await request(app).patch("/api/users/me").send({ name: "X Y" })).status).toBe(401);
  });
});

describe("image upload", () => {
  it("requires authentication and reports missing configuration", async () => {
    const user = await createUser("Uploader", "uploader@example.com");
    const token = await mintToken(user);
    const payload = { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" };

    const anon = await request(app).post("/api/upload").send(payload);
    expect(anon.status).toBe(401);

    const configured = await request(app)
      .post("/api/upload")
      .set(authHeader(token))
      .send(payload);
    expect(configured.status).toBe(501); // IMGBB_API_KEY intentionally empty in tests
    expect(configured.body.message).toMatch(/not configured/i);
  });

  it("rejects invalid payloads with 400", async () => {
    const user = await createUser("Uploader 2", "uploader2@example.com");
    const token = await mintToken(user);
    const res = await request(app)
      .post("/api/upload")
      .set(authHeader(token))
      .send({ image: "not-base64-at-all!!!" });
    expect(res.status).toBe(400);
  });
});
