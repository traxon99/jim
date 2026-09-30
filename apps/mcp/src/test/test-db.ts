import { readFileSync } from "node:fs";
import { createDb } from "@jim/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { UserContext } from "../context.js";

// Reaches into @jim/db's own test fixtures rather than duplicating them, the
// same way apps/web/lib/test/test-db.ts does.
const BOOTSTRAP_SQL = readFileSync(
  new URL("../../../../packages/db/test/bootstrap-supabase-stubs.sql", import.meta.url),
  "utf8",
);
const MIGRATIONS_FOLDER = new URL("../../../../packages/db/drizzle", import.meta.url).pathname;

export const USER_A = "11111111-1111-1111-1111-111111111111";
export const USER_B = "22222222-2222-2222-2222-222222222222";

export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for db integration tests");
  }
  return url;
}

/**
 * Resets a scratch Postgres database to a bare Supabase-like state, applies
 * every @jim/db migration and adds two users. Requires TEST_DATABASE_URL to
 * point at a disposable database — this drops and recreates the public and
 * auth schemas.
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

  await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
  await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;

  return admin;
}

/** A tool context acting as `userId`, through the same RLS path the server uses. */
export function testContext(userId: string): UserContext {
  return { db: createDb(requireTestDatabaseUrl()), userId, email: `${userId}@example.com` };
}
