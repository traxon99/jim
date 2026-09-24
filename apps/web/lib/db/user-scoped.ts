import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { type Db, type DbOrTx, createDb, runAsUser } from "@jim/db";

export class UnauthenticatedError extends Error {
  constructor() {
    super("No authenticated session");
  }
}

/**
 * Set directly in Vercel's Environment Variables settings (see
 * .env.example) — Supabase's pooler/transaction-mode connection string,
 * not the Supabase marketplace integration's auto-generated var, which is
 * tied to the storage resource's name and changes if it's reconfigured.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required (see .env.example)");
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

  return runAsUser(getDb(), userId, (tx) => fn(tx, userId, email));
}

/**
 * `withUserDb` for callers that already hold a verified user id without a
 * session cookie — the QStash-signed rest-timer callback
 * (app/api/push/rest-timer/fire/route.ts), whose body this server itself
 * wrote when the signed-in user started the rest. RLS still applies. Never
 * pass an id that hasn't been through signature verification.
 */
export function withVerifiedUserDb<T>(userId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return runAsUser(getDb(), userId, fn);
}
