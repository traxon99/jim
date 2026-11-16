import { eq, sql } from "drizzle-orm";
import { type DbOrTx, users } from "../index";
import { recordAdminAction } from "./audit";
import type { AdminActionResult, AdminActor } from "./user-actions";

/**
 * Force refresh (issue #808). Each request stamps the account (or, for
 * "Update app" for everyone, every account); phones read the stamp on their
 * next sync pull and act once (lib/pwa/remote-commands.ts). The stamp and
 * its audit row commit together.
 */

/** Asks one account's phones, or everyone's when `userId` is null, to update the app. */
export async function adminRequestAppUpdate(
  db: DbOrTx,
  actor: AdminActor,
  userId: string | null,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const stamp = { updateRequestedAt: sql`now()` };
    const updated = userId
      ? await tx.update(users).set(stamp).where(eq(users.id, userId)).returning({ id: users.id })
      : await tx.update(users).set(stamp).returning({ id: users.id });
    if (userId && updated.length === 0) return { ok: false, error: "No such account" };
    await recordAdminAction(tx, {
      actorId: actor.id,
      targetUserId: userId,
      action: "app.update",
      newValue: userId ? undefined : { accounts: updated.length },
      via: actor.via,
      sink: actor.sink,
    });
    return { ok: true };
  });
}

/**
 * Asks one account's phones to wipe their local data and pull it fresh. Each
 * phone waits until its own unsynced changes have reached the server.
 */
export async function adminRequestLocalReset(
  db: DbOrTx,
  actor: AdminActor,
  userId: string,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ resetRequestedAt: sql`now()` })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (updated.length === 0) return { ok: false, error: "No such account" };
    await recordAdminAction(tx, {
      actorId: actor.id,
      targetUserId: userId,
      action: "app.reset_local_data",
      via: actor.via,
      sink: actor.sink,
    });
    return { ok: true };
  });
}
