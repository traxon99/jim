import { type Db, createDb } from "@jim/db";

/**
 * Set directly in the deployment's environment variables (see
 * apps/mcp/.env.example) — see apps/web/lib/db/user-scoped.ts for the same
 * convention. Always impersonated via `runAsUser` (ADR-005/006), never
 * queried directly.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required (see apps/mcp/.env.example)");
  }
  return url;
}

let db: Db | undefined;

export function getDb(): Db {
  db ??= createDb(databaseUrl());
  return db;
}
