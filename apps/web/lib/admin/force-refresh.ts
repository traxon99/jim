import { refreshPushMessage } from "@/lib/pwa/notifications";
import { type PushSender, type StoredSubscription, fanOutPush } from "@/lib/pwa/send-push";
import { type Db, pushSubscriptions, users } from "@jim/db";
import { eq, inArray, sql } from "drizzle-orm";
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
  db: Db,
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
    });
    return { ok: true };
  });
}

/**
 * Asks one account's phones to wipe their local data and pull it fresh. Each
 * phone waits until its own unsynced changes have reached the server.
 */
export async function adminRequestLocalReset(
  db: Db,
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
    });
    return { ok: true };
  });
}

/**
 * The silent push that goes with "Update app": it wakes each phone's service
 * worker to fetch the new version now rather than on next open. Best effort:
 * push may not be configured, and a phone without notifications still gets
 * the request on its next sync. Returns how many devices it reached.
 */
export async function sendRefreshPush(
  db: Db,
  userId: string | null,
  send: PushSender,
): Promise<number> {
  const query = db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions);
  const subscriptions: StoredSubscription[] = userId
    ? await query.where(eq(pushSubscriptions.userId, userId))
    : await query;
  if (subscriptions.length === 0) return 0;
  const result = await fanOutPush(subscriptions, refreshPushMessage(), send);
  if (result.expired.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, result.expired));
  }
  return result.sent;
}
