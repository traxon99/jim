import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type TransactionSql } from "postgres";

const BOOTSTRAP_SQL = readFileSync(
  new URL("../../test/bootstrap-supabase-stubs.sql", import.meta.url),
  "utf8",
);
const MIGRATIONS_FOLDER = new URL("../../drizzle", import.meta.url).pathname;

/**
 * Resets a scratch Postgres database to a bare Supabase-like state (stub
 * `auth` schema/roles, then every drizzle migration) and returns a raw
 * postgres.js client for driving tests as specific roles/users.
 *
 * Requires TEST_DATABASE_URL to point at a disposable database — this drops
 * and recreates the public and auth schemas.
 */
export async function resetTestDb() {
  const url = requireTestDatabaseUrl();
  const admin = postgres(url, { max: 1, onnotice: () => {} });

  await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await admin.unsafe("CREATE SCHEMA public");
  await admin.unsafe("DROP SCHEMA IF EXISTS auth CASCADE");
  // Drizzle's own migration-tracking schema — drop it too, or a reset that
  // wipes `public` but leaves migrations marked "already applied" comes back empty.
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await admin.unsafe(BOOTSTRAP_SQL);
  await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_FOLDER });

  return admin;
}

export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for db integration tests");
  }
  return url;
}

/** Runs `fn` inside a transaction acting as `userId` under RLS, then rolls back. */
export async function asUser<T>(
  admin: postgres.Sql,
  userId: string | null,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  await admin
    .begin(async (tx) => {
      await tx.unsafe("SET LOCAL role authenticated");
      if (userId) {
        await tx.unsafe(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      }
      result = await fn(tx);
      throw new RolledBackByDesign();
    })
    .catch((err) => {
      if (!(err instanceof RolledBackByDesign)) throw err;
    });
  // biome-ignore lint/style/noNonNullAssertion: fn always assigns result before the sentinel throw
  return result!;
}

class RolledBackByDesign extends Error {}

/** Unwraps a query's first row, asserting the query returned at least one. */
export function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected at least one row, got none");
  }
  return row;
}
