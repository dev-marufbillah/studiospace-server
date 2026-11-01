#!/usr/bin/env node
/**
 * Reassign seeded demo studios to a real StudioSpace account so that account
 * becomes the host and can confirm/decline reservations from /dashboard.
 *
 * Why this exists: `npm run seed` creates the 12 demo listings under the
 * placeholder owner `seeded-demo-host`, which nobody can log in as. Bookings on
 * those studios therefore stay "Pending" forever, because only the studio's
 * host can confirm them. Run this once with your own account email.
 *
 * Usage:
 *   node scripts/make-host.mjs <email>               # only seeded demo studios
 *   node scripts/make-host.mjs <email> --all         # every studio in the DB
 *   node scripts/make-host.mjs <email> --dry         # show, change nothing
 *
 * Plain Node (no TypeScript build required). Reads MONGODB_URI / DB_NAME from
 * .env or the environment.
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const email = (process.argv[2] || "").trim().toLowerCase();
const flags = new Set(process.argv.slice(3).map((flag) => flag.toLowerCase()));
const applyAll = flags.has("--all");
const dryRun = flags.has("--dry") || flags.has("--dry-run");

if (!email || email.startsWith("--")) {
  console.error("Usage: node scripts/make-host.mjs <email> [--all] [--dry]");
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is missing. Add it to studiospace-server/.env first.");
  process.exit(1);
}
const dbName = process.env.DB_NAME || "studiospace";

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });

try {
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection("users");
  const studios = db.collection("studios");

  const user = await users.findOne({ email });
  if (!user) {
    const known = await users.find({}, { projection: { email: 1 } }).limit(10).toArray();
    console.error(`No StudioSpace account found for "${email}" in database "${dbName}".`);
    if (known.length > 0) {
      console.error("Accounts that exist:");
      for (const entry of known) console.error(`  - ${entry.email}`);
    } else {
      console.error("No accounts exist yet — register at /register first.");
    }
    process.exitCode = 1;
  } else {
    const hostId = String(user._id);
    const hostName = user.name || email;

    const filter = applyAll
      ? {}
      : {
          $or: [
            { _seedSlug: { $exists: true } },
            { ownerId: "seeded-demo-host" },
            { ownerId: { $exists: false } },
          ],
        };

    const matches = await studios.find(filter).project({ title: 1, ownerEmail: 1 }).toArray();

    if (matches.length === 0) {
      console.log("No studios matched. Try --all to reassign every studio.");
    } else {
      console.log(
        `${dryRun ? "[dry run] would reassign" : "reassigning"} ${matches.length} studio(s) to ${email} (${hostId})`
      );
      for (const studio of matches) {
        console.log(`  - ${studio.title}  (was: ${studio.ownerEmail ?? "unknown"})`);
      }

      if (!dryRun) {
        const result = await studios.updateMany(filter, {
          $set: {
            ownerId: hostId,
            ownerEmail: email,
            ownerName: hostName,
            updatedAt: new Date(),
          },
        });
        console.log(`\nUpdated ${result.modifiedCount} studio(s).`);
        console.log("Now open http://localhost:3000/dashboard → Incoming reservations to confirm bookings.");
      }
    }
  }
} catch (error) {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
