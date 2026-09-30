import { hashAccessToken } from "@jim/core";
import type { Db } from "@jim/db";
import { sql } from "drizzle-orm";

/**
 * The `expiresAt` reported for a valid token. Every request re-verifies the
 * token (index.ts builds a fresh context per request), so this only has to
 * outlive the request it's checked on — revoking or expiring a token takes
 * effect on the very next call.
 */
const VERIFIED_TTL_SECONDS = 60 * 60;

export interface ResolvedAccessToken {
  userId: string;
  /** Unix seconds; the SDK's bearer middleware requires one. */
  expiresAt: number;
}

/**
 * Resolves a personal access token (issue #246) to its owner, or null if it's
 * unknown, revoked or expired. Runs as the `anon` role and goes through
 * migration 0027's SECURITY DEFINER function, the only way to find a token
 * row without already knowing whose it is — never a service-role read
 * (ADR-006).
 */
export async function resolveAccessToken(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<ResolvedAccessToken | null> {
  const hash = await hashAccessToken(token);
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE anon`);
    const [result] = await tx.execute<{ user_id: string | null }>(
      sql`SELECT resolve_personal_access_token(${hash}) AS user_id`,
    );
    return result;
  });
  if (!row?.user_id) return null;
  return {
    userId: row.user_id,
    expiresAt: Math.floor(now.getTime() / 1000) + VERIFIED_TTL_SECONDS,
  };
}
