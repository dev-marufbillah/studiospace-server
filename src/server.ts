import { createApp } from "./app";
import { connectDatabase, closeDatabase } from "./config/database";
import { ensureIndexes } from "./config/indexes";
import { env } from "./config/env";

async function main(): Promise<void> {
  const db = await connectDatabase();
  await ensureIndexes(db);

  const app = createApp();
  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(
      `[StudioSpace API] listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`
    );
  });

  const shutdown = (signal: string) => {
    console.log(`[StudioSpace API] received ${signal}, shutting down...`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    // Force-exit if the server refuses to close gracefully.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[StudioSpace API] failed to start:", error);
  process.exit(1);
});
