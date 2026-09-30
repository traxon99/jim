import { type Db, type DbOrTx, runAsUser } from "@jim/db";

/** Per-request identity, taken from the verified Supabase access token (see auth/provider.ts). */
export interface UserContext {
  db: Db;
  userId: string;
  email: string;
}

/** Runs `fn` inside an RLS-impersonated transaction for this request's user (ADR-005/006). */
export function withUser<T>(context: UserContext, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return runAsUser(context.db, context.userId, fn);
}

/** Thrown out of a dry run's transaction so Postgres rolls it back; carries the would-be result. */
class DryRunRollback<T> extends Error {
  constructor(readonly result: T) {
    super("dry run rolled back");
  }
}

/**
 * `withUser` for write tools that accept `dry_run` (#245). The write runs
 * for real — same validation, same exercise resolution, same RLS — and a
 * dry run then rolls the whole transaction back, so the preview can't drift
 * from what the committed call does. Ids and timestamps in a preview are
 * provisional; a real call generates fresh ones.
 */
export async function withUserWrite<T extends object>(
  context: UserContext,
  dryRun: boolean,
  fn: (tx: DbOrTx) => Promise<T>,
): Promise<T & { dryRun: boolean }> {
  if (!dryRun) {
    return { ...(await withUser(context, fn)), dryRun: false };
  }
  try {
    await withUser(context, async (tx) => {
      throw new DryRunRollback(await fn(tx));
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return { ...(error.result as T), dryRun: true };
    throw error;
  }
  throw new Error("unreachable: a dry run always rolls back");
}
