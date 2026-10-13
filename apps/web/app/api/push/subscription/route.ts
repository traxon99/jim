import { readJsonBody, unauthenticatedOrThrow } from "@/lib/api/route-helpers";
import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { withUserDb } from "@/lib/db/user-scoped";
import { isEndpointPayload, isPushSubscriptionPayload } from "@/lib/pwa/push-subscription";
import { pushSubscriptions } from "@jim/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Stores (or refreshes) this browser's Web Push subscription for the
 * signed-in user. Idempotent — the client re-posts its current subscription
 * on every app load so the server's copy can't silently go stale.
 */
export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const body = parsed.body;
  if (!isPushSubscriptionPayload(body)) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  try {
    await withUserDb(async (tx, userId, email) => {
      // push_subscriptions.user_id FKs to users; a brand-new account may not
      // have its row yet (same self-heal as /api/settings).
      await ensureUserRow(tx, userId, email);
      await tx
        .insert(pushSubscriptions)
        .values({ userId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth })
        .onConflictDoUpdate({
          target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
          set: { p256dh: body.keys.p256dh, auth: body.keys.auth },
        });
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}

/** Forgets this browser's subscription (the user turned notifications off). */
export async function DELETE(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const body = parsed.body;
  if (!isEndpointPayload(body)) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  try {
    await withUserDb(async (tx, userId) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, body.endpoint)),
        );
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
