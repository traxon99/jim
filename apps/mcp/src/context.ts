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
