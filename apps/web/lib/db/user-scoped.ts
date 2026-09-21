import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { type Db, type DbOrTx, createDb } from "@jim/db";
import { sql } from "drizzle-orm";

export class UnauthenticatedError extends Error {
  constructor() {
    super("No authenticated session");
  }
}

/**
 * `DATABASE_URL` for local dev (see .env.example); `JIM_DB_POSTGRES_URL` is
 * what Vercel's Supabase marketplace integration (the "JIM_DB" storage
 * resource) names the pooled connection string in deployed environments.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.JIM_DB_POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL or JIM_DB_POSTGRES_URL is required (see .env.example)");
  }
  return url;
}

let db: Db | undefined;
function getDb(): Db {
  db ??= createDb(databaseUrl());
  return db;
}

/**
 * Runs `fn` inside a Postgres transaction impersonating the verified
 * session's user, so RLS is the actual enforcement boundary (ADR-005/006)
 * rather than an application-layer WHERE clause — the same guarantee
 * PostgREST gives you, done by hand because the sync routes need Drizzle's
 * transactional, conditionally-guarded upserts, which PostgREST can't express.
 *
 * `getClaims()` verifies the JWT signature via Supabase's JWKS endpoint
 * before this ever runs, so the id being impersonated here is not
 * client-supplied — only the already-authenticated request's own id.
 */
export async function withUserDb<T>(
  fn: (tx: DbOrTx, userId: string, email: string) => Promise<T>,
): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) {
    throw new UnauthenticatedError();
  }
  // Only settings' ensureUserRow actually needs this; sync's push/pull
  // never touch it, so its absence (as in their test mocks) can't regress them.
  const email = data?.claims.email ?? "";

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`);
    return fn(tx, userId, email);
  });
}
