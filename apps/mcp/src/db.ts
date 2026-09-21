import { type Db, createDb } from "@jim/db";

/**
 * `DATABASE_URL` for local dev; `JIM_DB_POSTGRES_URL` is what Vercel's
 * Supabase marketplace integration names the pooled connection string in
 * deployed environments — see apps/web/lib/db/user-scoped.ts for the same
 * convention. Always impersonated via `runAsUser` (ADR-005/006), never
 * queried directly.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.JIM_DB_POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL or JIM_DB_POSTGRES_URL is required (see apps/mcp/.env.example)");
  }
  return url;
}

let db: Db | undefined;

export function getDb(): Db {
  db ??= createDb(databaseUrl());
  return db;
}
