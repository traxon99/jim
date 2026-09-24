import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { type RestTimerFirePayload, parseRestTimerStart } from "@/lib/pwa/rest-timer-push";
import { configureWebPush } from "@/lib/pwa/web-push-server";
import { pushSubscriptions, restTimerPushes } from "@jim/db";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

function unauthenticatedOrThrow(error: unknown) {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  throw error;
}

/**
 * Schedules the "Rest complete" push for the rest period the signed-in user
 * just started (docs/DECISIONS.md ADR-014). The page can't be trusted to
 * fire it itself: iOS suspends a backgrounded PWA's JS, so a page-side timer
 * only notices the rest ended once the user reopens Jim. Instead QStash
 * calls /api/push/rest-timer/fire at `endsAt`, which pushes to this device.
 *
 * Replaces any rest already pending for the user; the earlier QStash message
 * still arrives but finds its row gone and sends nothing.
 *
 * 503 when QStash or VAPID isn't configured, 404 when `endpoint` isn't one of
 * the user's stored subscriptions: either way the client falls back to its
 * own page-side notification.
 */
export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const start = parseRestTimerStart(parsed.body, new Date());
  if (!start) return NextResponse.json({ error: "Invalid rest timer" }, { status: 400 });

  if (!process.env.QSTASH_TOKEN || !configureWebPush()) {
    return NextResponse.json({ error: "Rest timer push is not configured" }, { status: 503 });
  }

  try {
    const scheduled = await withUserDb(async (tx, userId) => {
      const [subscription] = await tx
        .select({ endpoint: pushSubscriptions.endpoint })
        .from(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, start.endpoint)),
        );
      if (!subscription) return false;

      await tx
        .insert(restTimerPushes)
        .values({ userId, endpoint: start.endpoint, endsAt: start.endsAt })
        .onConflictDoUpdate({
          target: restTimerPushes.userId,
          set: { endpoint: start.endpoint, endsAt: start.endsAt, createdAt: new Date() },
        });

      // Inside the transaction on purpose: if publishing fails, the row
      // rolls back too and the client falls back to its local notification.
      const body: RestTimerFirePayload = { userId, endsAt: start.endsAt.toISOString() };
      await new Client().publishJSON({
        url: new URL("/api/push/rest-timer/fire", request.url).href,
        body,
        notBefore: Math.ceil(start.endsAt.getTime() / 1000),
        // QStash's retry backoff is measured in minutes; one retry is the
        // most a "rest complete" alert stays worth delivering late.
        retries: 1,
      });
      return true;
    });
    if (!scheduled) {
      return NextResponse.json({ error: "Unknown push subscription" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}

/** Cancels the pending push (rest skipped, workout finished or cancelled). */
export async function DELETE() {
  try {
    await withUserDb(async (tx, userId) => {
      await tx.delete(restTimerPushes).where(eq(restTimerPushes.userId, userId));
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
