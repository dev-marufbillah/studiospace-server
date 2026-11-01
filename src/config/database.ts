import { Db, MongoClient, ObjectId } from "mongodb";
import { env } from "./env";

let client: MongoClient | null = null;
let database: Db | null = null;

/** Opens the shared MongoDB connection (idempotent). */
export async function connectDatabase(): Promise<Db> {
  if (database) return database;
  client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  database = client.db(env.DB_NAME);
  return database;
}

/** Returns the live database handle. Throws if connectDatabase() was not called. */
export function getDatabase(): Db {
  if (!database) {
    throw new Error("Database has not been initialized. Call connectDatabase() first.");
  }
  return database;
}

/** Closes the connection cleanly (used on shutdown and between tests). */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** True when the string is a canonical 24-hex MongoDB ObjectId. */
export function isValidObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value);
}

/** Converts a validated hex string to ObjectId (throws on invalid input). */
export function toObjectId(value: string): ObjectId {
  if (!isValidObjectId(value)) {
    throw new Error(`Invalid ObjectId: ${value}`);
  }
  return new ObjectId(value);
}
