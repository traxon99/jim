import { type DbOrTx, users } from "@jim/db";
import { eq } from "drizzle-orm";

/**
 * S1 notes "a row is created for a user on first sign-in", but nothing in
 * this codebase actually does that yet (no auth trigger, no app-side
 * insert) — so the routes that read the row self-heal it here rather than
 * 404ing a brand-new user out of their own settings. The insert also gives
 * the user their email-derived username (migration 0023's trigger).
 */
export async function ensureUserRow(tx: DbOrTx, userId: string, email: string) {
  await tx.insert(users).values({ id: userId, email }).onConflictDoNothing();
  const [row] = await tx.select().from(users).where(eq(users.id, userId));
  if (!row) throw new Error("Failed to create or load the user's settings row");
  return row;
}
