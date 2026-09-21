import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// MIGRATE_DATABASE_URL takes precedence so deploy environments (e.g. Vercel's
// build step) can point migrations at the session pooler — required for the
// advisory lock drizzle's migrator takes — while DATABASE_URL stays the
// transaction-pooler string the app itself connects with at runtime.
const databaseUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "MIGRATE_DATABASE_URL or DATABASE_URL is required (see packages/db/.env.example)",
  );
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await client.end();

console.log("Migrations applied.");
