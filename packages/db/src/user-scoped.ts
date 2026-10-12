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
export function runAsUser<T>(
  db: Db,
  userId: string,
  fn: (tx: DbOrTx) => Promise<T>,
  options: { exclusive?: boolean } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    // Every transaction for a user holds that user's advisory lock, shared,
    // and the sync pull takes it exclusively (issue #488). server_seq values
    // are drawn at nextval time but only become visible at commit, so a pull
    // running beside an open write could see a later seq, advance its cursor
    // past the earlier one and never pull it. Taking the lock before any
    // nextval means the pull waits for in-flight writes to commit, and new
    // ones wait for the pull, so its cursor never jumps a gap.
    if (options.exclusive) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    } else {
      await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${userId}, 0))`);
    }
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`);
    return fn(tx);
  });
}
