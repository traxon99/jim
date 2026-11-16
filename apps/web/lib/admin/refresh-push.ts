import { refreshPushMessage } from "@/lib/pwa/notifications";
import { type PushSender, type StoredSubscription, fanOutPush } from "@/lib/pwa/send-push";
import { type Db, pushSubscriptions } from "@jim/db";
import { eq, inArray } from "drizzle-orm";

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
