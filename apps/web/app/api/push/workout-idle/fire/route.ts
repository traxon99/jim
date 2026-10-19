import { withVerifiedUserDb } from "@/lib/db/user-scoped";
import { idleWorkoutMessage, workoutAutoEndedMessage } from "@/lib/pwa/notifications";
import { fanOutPush } from "@/lib/pwa/send-push";
import { configureWebPush, webpush } from "@/lib/pwa/web-push-server";
import {
  type WorkoutIdleFirePayload,
  isWorkoutIdleFirePayload,
  workoutIdleFireUrl,
} from "@/lib/pwa/workout-idle-push";
import { autoEndAt } from "@jim/core";
import { pushSubscriptions, sessions, workoutIdlePushes } from "@jim/db";
import { Client, Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * QStash's delayed callback for the idle-workout pushes scheduled by
 * POST /api/push/workout-idle (issue #648). Authenticated by QStash's
 * signature over the body and URL, like the rest timer's fire route; the
 * body's userId is the one this server wrote for the signed-in user.
 *
 * Sends only while the user's row still has the same session and
 * `last_activity_at`, and the server's copy of the workout isn't already
 * finished or deleted. The "remind" stage leaves the row in place and
 * publishes the "end" stage for the auto-end time; the "end" stage consumes
 * the row. Every no-op answers 2xx so QStash doesn't retry it.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return NextResponse.json({ error: "QStash signing keys are not configured" }, { status: 503 });
  }
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  const fireUrl = workoutIdleFireUrl(request.url);
  const valid = await new Receiver()
    .verify({ signature, body: rawBody, url: fireUrl })
    .catch(() => false);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isWorkoutIdleFirePayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!configureWebPush()) return new NextResponse(null, { status: 204 });

  const { userId, sessionId, stage } = body;
  const lastActivityAt = new Date(body.lastActivityAt);
  const due = await withVerifiedUserDb(userId, async (tx) => {
    const matches = and(
      eq(workoutIdlePushes.userId, userId),
      eq(workoutIdlePushes.sessionId, sessionId),
      eq(workoutIdlePushes.lastActivityAt, lastActivityAt),
    );
    const [pending] = await tx.select().from(workoutIdlePushes).where(matches);
    if (!pending) return undefined;

    // Finished or cancelled and already synced, but the phone's DELETE
    // never arrived (offline): nothing to say.
    const [session] = await tx
      .select({ endedAt: sessions.endedAt, deletedAt: sessions.deletedAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    if (session && (session.endedAt || session.deletedAt)) {
      await tx.delete(workoutIdlePushes).where(matches);
      return undefined;
    }

    const endAt = autoEndAt(lastActivityAt, pending.autoEndMinutes);
    if (stage === "end") {
      await tx.delete(workoutIdlePushes).where(matches);
      if (pending.autoEndMinutes === null) return undefined;
    } else if (endAt) {
      // Inside the transaction so a failed publish fails the callback, and
      // QStash's retry gets another go at scheduling it.
      const next: WorkoutIdleFirePayload = { ...body, stage: "end" };
      await new Client().publishJSON({
        url: fireUrl,
        body: next,
        notBefore: Math.ceil(endAt.getTime() / 1000),
        retries: 1,
      });
    }

    const [subscription] = await tx
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, pending.endpoint)),
      );
    if (!subscription) return undefined;
    const message =
      stage === "end" && pending.autoEndMinutes !== null
        ? workoutAutoEndedMessage(sessionId, pending.autoEndMinutes)
        : idleWorkoutMessage(sessionId);
    return { subscription, message };
  });
  if (!due) return new NextResponse(null, { status: 204 });

  const { subscription, message } = due;
  const result = await fanOutPush([subscription], message, (sub, payload) =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      // A reminder that arrives hours late is noise; an hour of TTL still
      // covers a phone that was briefly offline.
      { TTL: 60 * 60, topic: "jim-workout-idle", urgency: "normal" },
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
  if (result.failed > 0) console.error("[workout-idle-push] Push service rejected the send.");
  return new NextResponse(null, { status: 204 });
}
