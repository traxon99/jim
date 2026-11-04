import { type AccessTokenScope, hashAccessToken, isAccessTokenScope } from "@jim/core";
import type { Db } from "@jim/db";
import { type SQL, sql } from "drizzle-orm";

/**
 * The `expiresAt` reported for a valid token. Every request re-verifies the
 * token (index.ts builds a fresh context per request), so this only has to
 * outlive the request it's checked on — revoking or expiring a token takes
 * effect on the very next call.
 */
const VERIFIED_TTL_SECONDS = 60 * 60;

/** Postgres `undefined_function`. */
const UNDEFINED_FUNCTION = "42883";

export interface ResolvedAccessToken {
  userId: string;
  /** `read` tokens can't call write tools (issue #736). */
  scope: AccessTokenScope;
  /** Unix seconds; the SDK's bearer middleware requires one. */
  expiresAt: number;
}

function isUndefinedFunction(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === UNDEFINED_FUNCTION) return true;
  }
  return false;
}

/**
 * Resolves a personal access token (issue #246) to its owner and scope, or
 * null if it's unknown, revoked or expired. Runs as the `anon` role and goes
 * through migration 0060's SECURITY DEFINER function, the only way to find a
 * token row without already knowing whose it is — never a service-role read
 * (ADR-006).
 *
 * The MCP server deploys from GitHub Actions while migrations apply on the
 * Vercel production build, so for a few minutes after a merge this code can
 * run against a database without 0060. It then falls back to 0027's resolver
 * and treats the token as `read_write`. That can't widen a `read` token: read
 * tokens can only be created once the same migration has added the column.
 */
export async function resolveAccessToken(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<ResolvedAccessToken | null> {
  const hash = await hashAccessToken(token);
  const asAnon = <T>(query: SQL) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE anon`);
      const [result] = await tx.execute<T & Record<string, unknown>>(query);
      return result;
    });

  let row: { user_id: string | null; scope: string | null } | undefined;
  try {
    row = await asAnon<{ user_id: string | null; scope: string | null }>(
      sql`SELECT user_id, scope FROM resolve_personal_access_token_scoped(${hash})`,
    );
  } catch (error) {
    if (!isUndefinedFunction(error)) throw error;
    const legacy = await asAnon<{ user_id: string | null }>(
      sql`SELECT resolve_personal_access_token(${hash}) AS user_id`,
    );
    row = legacy ? { user_id: legacy.user_id, scope: "read_write" } : undefined;
  }
  if (!row?.user_id) return null;
  return {
    userId: row.user_id,
    // An unknown scope fails closed to read only.
    scope: isAccessTokenScope(row.scope) ? row.scope : "read",
    expiresAt: Math.floor(now.getTime() / 1000) + VERIFIED_TTL_SECONDS,
  };
}
