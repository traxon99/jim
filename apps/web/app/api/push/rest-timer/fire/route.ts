import { withVerifiedUserDb } from "@/lib/db/user-scoped";
import { restCompleteMessage } from "@/lib/pwa/notifications";
import { isRestTimerFirePayload } from "@/lib/pwa/rest-timer-push";
import { fanOutPush } from "@/lib/pwa/send-push";
import { configureWebPush, webpush } from "@/lib/pwa/web-push-server";
import { pushSubscriptions, restTimerPushes } from "@jim/db";
import { Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * QStash's delayed callback for a rest period scheduled by
 * POST /api/push/rest-timer (docs/DECISIONS.md ADR-014). No session cookie
 * reaches here (proxy.ts lets this path through); the QStash signature over
 * the body is what authenticates it, and the body's userId is the one this
 * server wrote when the signed-in user started the rest.
 *
 * Sends only if the user's pending rest still ends at the same instant: a
 * skipped rest has no row, a restarted one has a different `ends_at`. Either
 * way this answers 2xx so QStash doesn't retry a deliberate no-op.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return NextResponse.json({ error: "QStash signing keys are not configured" }, { status: 503 });
  }
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  const valid = await new Receiver().verify({ signature, body: rawBody }).catch(() => false);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRestTimerFirePayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!configureWebPush()) return new NextResponse(null, { status: 204 });

  const { userId } = body;
  const subscription = await withVerifiedUserDb(userId, async (tx) => {
    const [pending] = await tx
      .delete(restTimerPushes)
      .where(
        and(eq(restTimerPushes.userId, userId), eq(restTimerPushes.endsAt, new Date(body.endsAt))),
      )
      .returning({ endpoint: restTimerPushes.endpoint });
    if (!pending) return undefined;
    const [row] = await tx
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, pending.endpoint)),
      );
    return row;
  });
  if (!subscription) return new NextResponse(null, { status: 204 });

  const result = await fanOutPush([subscription], restCompleteMessage(), (sub, payload) =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      // High urgency so a phone in power-saving still wakes for it; a short
      // TTL because a "rest complete" that arrives minutes late is just noise.
      { TTL: 60, topic: "jim-rest-timer", urgency: "high" },
    ),
  );
  if (result.expired.length > 0) {
    await withVerifiedUserDb(userId, (tx) =>
      tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, userId),
            eq(pushSubscriptions.endpoint, subscription.endpoint),
          ),
        ),
    );
  }
  if (result.failed > 0) console.error("[rest-timer-push] Push service rejected the send.");
  return new NextResponse(null, { status: 204 });
}
