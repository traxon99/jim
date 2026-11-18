import { serviceDb } from "@/lib/db/user-scoped";
import { StravaApiError, createActivity } from "@/lib/strava/client";
import { isStravaPostPayload, stravaConfig, stravaPostUrl } from "@/lib/strava/config";
import {
  deleteStravaConnection,
  getStravaConnection,
  validAccessToken,
} from "@/lib/strava/connection";
import { loadStravaActivity } from "@/lib/strava/load-activity";
import { shouldPostToStrava } from "@jim/core";
import { claimStravaPost, markStravaFailed, markStravaPosted, stravaActivities } from "@jim/db";
import { Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** A post that has failed this many times stays failed until the lifter retries it. */
const MAX_ATTEMPTS = 6;

/**
 * QStash's callback that posts one finished workout to Strava (issue #836).
 * Authenticated by QStash's signature over the body and URL, like the rest
 * timer's fire route (ADR-014); the body's ids are the ones this server wrote.
 *
 * The strava_activities row is claimed (queued|failed → posting) in a single
 * statement and Strava is only called when the claim succeeds, so a retry, a
 * double delivery or a double sync can't post twice. Answers 5xx only for
 * what a later try can fix (rate limit, Strava down), so QStash backs off and
 * retries; everything else answers 2xx with the row left `failed`.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return NextResponse.json({ error: "QStash signing keys are not configured" }, { status: 503 });
  }
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  const valid = await new Receiver()
    .verify({ signature, body: rawBody, url: stravaPostUrl(request.url) })
    .catch(() => false);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isStravaPostPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const config = stravaConfig();
  if (!config) return new NextResponse(null, { status: 204 });

  const { userId, sessionId } = body;
  const db = serviceDb();
  const claimed = await claimStravaPost(db, sessionId);
  if (!claimed || claimed.userId !== userId) return new NextResponse(null, { status: 204 });
  if (claimed.attempts > MAX_ATTEMPTS) {
    await markStravaFailed(db, sessionId, "Gave up after too many tries");
    return new NextResponse(null, { status: 204 });
  }

  // Not posting after all (turned off or deleted since it was queued): drop
  // the row so turning it back on queues it again.
  const drop = () =>
    db
      .delete(stravaActivities)
      .where(and(eq(stravaActivities.sessionId, sessionId), eq(stravaActivities.userId, userId)));

  try {
    const connection = await getStravaConnection(userId);
    if (!connection) {
      await markStravaFailed(db, sessionId, "Strava isn't connected");
      return new NextResponse(null, { status: 204 });
    }
    const loaded = await loadStravaActivity(userId, sessionId);
    if (!loaded) {
      await drop();
      return new NextResponse(null, { status: 204 });
    }
    if (!shouldPostToStrava({ autoPost: connection.autoPost, stravaPost: loaded.stravaPost })) {
      await drop();
      return new NextResponse(null, { status: 204 });
    }

    const token = await validAccessToken(connection, config);
    if (!token) {
      await markStravaFailed(db, sessionId, "Strava access expired");
      return new NextResponse(null, { status: 204 });
    }
    const activityId = await createActivity(token, loaded.activity);
    await markStravaPosted(db, sessionId, activityId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof StravaApiError) {
      if (error.unauthorized) {
        // Revoked on Strava's side: Settings shows disconnected.
        await deleteStravaConnection(userId);
        await markStravaFailed(db, sessionId, "Strava access was revoked");
        return new NextResponse(null, { status: 204 });
      }
      await markStravaFailed(
        db,
        sessionId,
        error.status === 429 ? "Strava is busy, trying again" : error.message,
      );
      if (error.retryable) return new NextResponse(null, { status: 503 });
      return new NextResponse(null, { status: 204 });
    }
    console.error("[strava] posting a workout failed:", error);
    await markStravaFailed(db, sessionId, "Couldn't post to Strava");
    return new NextResponse(null, { status: 500 });
  }
}
