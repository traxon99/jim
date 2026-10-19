import { readJsonBody, unauthenticatedOrThrow } from "@/lib/api/route-helpers";
import { withUserDb } from "@/lib/db/user-scoped";
import { configureWebPush } from "@/lib/pwa/web-push-server";
import {
  type WorkoutIdleFirePayload,
  parseWorkoutIdleStart,
  workoutIdleFireUrl,
} from "@/lib/pwa/workout-idle-push";
import { autoEndAt, idleReminderAt } from "@jim/core";
import { pushSubscriptions, workoutIdlePushes } from "@jim/db";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** A reminder this late isn't worth sending; the next stage is scheduled instead. */
const LATE_REMINDER_MS = 60_000;

/**
 * Schedules the idle-workout pushes for the signed-in user's active workout
 * (issue #648): "Still working out?" 10 minutes after its last activity,
 * then "Workout ended" at the user's auto-end time. The phone posts again
 * whenever the last activity moves (a set logged, an exercise added), which
 * replaces the row; earlier QStash messages still arrive but find a
 * different `last_activity_at` and send nothing (the ADR-014 pattern).
 *
 * Only the reminder is published here. Its callback publishes the "ended"
 * one, so a busy workout costs one QStash message per activity, not two.
 *
 * 503 when QStash or VAPID isn't configured, 404 when `endpoint` isn't one of
 * the user's stored subscriptions; the phone still ends the workout itself
 * either way, it just isn't told while Jim is closed.
 */
export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const now = new Date();
  const start = parseWorkoutIdleStart(parsed.body, now);
  if (!start) return NextResponse.json({ error: "Invalid workout activity" }, { status: 400 });

  if (!process.env.QSTASH_TOKEN || !configureWebPush()) {
    return NextResponse.json({ error: "Workout idle push is not configured" }, { status: 503 });
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

      // The same schedule posted again (a reload, a retry) is already queued.
      const [existing] = await tx
        .select()
        .from(workoutIdlePushes)
        .where(eq(workoutIdlePushes.userId, userId));
      if (
        existing &&
        existing.sessionId === start.sessionId &&
        existing.endpoint === start.endpoint &&
        existing.lastActivityAt.getTime() === start.lastActivityAt.getTime() &&
        existing.autoEndMinutes === start.autoEndMinutes
      ) {
        return true;
      }

      const values = {
        sessionId: start.sessionId,
        endpoint: start.endpoint,
        lastActivityAt: start.lastActivityAt,
        autoEndMinutes: start.autoEndMinutes,
      };
      await tx
        .insert(workoutIdlePushes)
        .values({ userId, ...values })
        .onConflictDoUpdate({
          target: workoutIdlePushes.userId,
          set: { ...values, createdAt: now },
        });

      // A device that was offline past the reminder skips straight to the
      // "ended" push rather than sending a stale "Still working out?".
      const remindAt = idleReminderAt(start.lastActivityAt);
      const endAt = autoEndAt(start.lastActivityAt, start.autoEndMinutes);
      const late = remindAt.getTime() < now.getTime() - LATE_REMINDER_MS;
      const stage = late ? "end" : "remind";
      const at = late ? endAt : remindAt;
      if (!at) return true;

      // Inside the transaction on purpose: if publishing fails, the row
      // rolls back too.
      const body: WorkoutIdleFirePayload = {
        userId,
        sessionId: start.sessionId,
        lastActivityAt: start.lastActivityAt.toISOString(),
        stage,
      };
      await new Client().publishJSON({
        url: workoutIdleFireUrl(request.url),
        body,
        notBefore: Math.ceil(at.getTime() / 1000),
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

/** Cancels the pending pushes (workout finished, cancelled or ended). */
export async function DELETE() {
  try {
    await withUserDb(async (tx, userId) => {
      await tx.delete(workoutIdlePushes).where(eq(workoutIdlePushes.userId, userId));
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
