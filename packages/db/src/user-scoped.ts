import { sql } from "drizzle-orm";
import type { Db, DbOrTx } from "./client";

/**
 * Runs `fn` inside a Postgres transaction impersonating `userId`, so RLS is
 * the actual enforcement boundary (ADR-005/006) rather than an
 * application-layer WHERE clause — the same guarantee PostgREST gives you,
 * done by hand because callers need Drizzle's transactional, conditionally-
 * guarded upserts, which PostgREST can't express.
 *
 * Shared by every caller that holds an already-verified user id (the web
 * app's session cookie, the MCP server's OAuth bearer token) — never call
 * this with a caller-supplied id that hasn't been through signature
 * verification first, or it becomes an impersonation oracle.
 */
export function runAsUser<T>(db: Db, userId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`);
    return fn(tx);
  });
}
