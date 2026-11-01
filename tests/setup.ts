import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Test environment. Runs before the test file is imported, so the app
 * (which reads env at import time) sees a fully configured environment.
 * A throwaway in-memory MongoDB provides the database.
 */

process.env.NODE_ENV = "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017";
process.env.DB_NAME = "studiospace_test";
process.env.JWT_SECRET ??= "test-jwt-secret-value-0123456789abcdef";
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_COOKIE_NAME = "studiospace_session";
process.env.INTERNAL_API_SECRET ??= "test-internal-secret-value-0123456789";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.IMGBB_API_KEY = "";
process.env.RATE_LIMIT_MAX = "10000";

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri();

interface MongodHandle {
  stop: () => Promise<boolean>;
}

(globalThis as unknown as { __TEST_MONGOD__?: MongodHandle }).__TEST_MONGOD__ = mongod;

export async function stopTestMongo(): Promise<void> {
  const handle = (globalThis as unknown as { __TEST_MONGOD__?: MongodHandle }).__TEST_MONGOD__;
  if (handle) {
    await handle.stop();
    delete (globalThis as unknown as { __TEST_MONGOD__?: MongodHandle }).__TEST_MONGOD__;
  }
}
