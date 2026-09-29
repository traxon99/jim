import type { PushMessage } from "@/lib/pwa/notifications";

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one push; rejects with an error carrying the push service's `statusCode` on failure (web-push's shape). */
export type PushSender = (subscription: StoredSubscription, payload: string) => Promise<unknown>;

export interface FanOutResult {
  sent: number;
  failed: number;
  /** Endpoints the push service says are gone for good. Delete these. */
  expired: string[];
}

/**
 * 404 and 410 mean the subscription no longer exists (app uninstalled,
 * permission revoked, subscription rotated). Anything else (a 429, a 5xx,
 * a network error) might be transient, so the row is kept.
 */
export function isExpiredSubscriptionError(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 404 || status === 410;
}

/**
 * Rows are unique per (user, endpoint), so one browser signed in to two
 * accounts stores the same endpoint twice. A release push reads every row,
 * so without this that device would be notified once per row.
 */
function uniqueByEndpoint(subscriptions: StoredSubscription[]): StoredSubscription[] {
  return [...new Map(subscriptions.map((sub) => [sub.endpoint, sub])).values()];
}

export async function fanOutPush(
  allSubscriptions: StoredSubscription[],
  message: PushMessage,
  send: PushSender,
): Promise<FanOutResult> {
  const subscriptions = uniqueByEndpoint(allSubscriptions);
  const payload = JSON.stringify(message);
  const results = await Promise.allSettled(subscriptions.map((sub) => send(sub, payload)));

  const result: FanOutResult = { sent: 0, failed: 0, expired: [] };
  results.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      result.sent++;
    } else if (isExpiredSubscriptionError(outcome.reason)) {
      result.expired.push(subscriptions[i].endpoint);
    } else {
      result.failed++;
    }
  });
  return result;
}
