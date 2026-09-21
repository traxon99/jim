import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Reaches into @jim/db's own test fixtures rather than duplicating them —
// the monorepo layout (apps/web and packages/db as siblings) is assumed
// elsewhere already (docs/ARCHITECTURE.md §7).
const BOOTSTRAP_SQL = readFileSync(
  new URL("../../../../packages/db/test/bootstrap-supabase-stubs.sql", import.meta.url),
  "utf8",
);
const MIGRATIONS_FOLDER = new URL("../../../../packages/db/drizzle", import.meta.url).pathname;

export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for db integration tests");
  }
  return url;
}

/**
 * Resets a scratch Postgres database to a bare Supabase-like state and
 * applies every @jim/db migration. Requires TEST_DATABASE_URL to point at a
 * disposable database — this drops and recreates the public and auth schemas.
 */
export async function resetTestDb() {
  const url = requireTestDatabaseUrl();
  const admin = postgres(url, { max: 1, onnotice: () => {} });

  await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await admin.unsafe("CREATE SCHEMA public");
  await admin.unsafe("DROP SCHEMA IF EXISTS auth CASCADE");
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await admin.unsafe(BOOTSTRAP_SQL);
  await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_FOLDER });

  return admin;
}
