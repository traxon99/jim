import { isUuid, readJsonObject, unauthenticatedOrThrow } from "@/lib/api/route-helpers";
import { serviceDb } from "@/lib/db/user-scoped";
import { requireUserId } from "@/lib/strava/auth";
import { stravaPostingConfigured } from "@/lib/strava/config";
import { publishStravaPost } from "@/lib/strava/enqueue";
import { markStravaFailed, requeueFailedStravaPost } from "@jim/db";
import { NextResponse } from "next/server";

/** The "Couldn't post to Strava. Retry" button (issue #836): puts a failed post back in the queue. */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body || !isUuid(body.sessionId)) {
    return NextResponse.json({ error: "Expected { sessionId }" }, { status: 400 });
  }
  if (!stravaPostingConfigured()) {
    return NextResponse.json({ error: "Strava is not set up" }, { status: 503 });
  }
  try {
    const userId = await requireUserId();
    const db = serviceDb();
    const moved = await requeueFailedStravaPost(db, userId, body.sessionId);
    if (!moved) return NextResponse.json({ error: "Nothing to retry" }, { status: 404 });
    try {
      await publishStravaPost(request.url, { userId, sessionId: body.sessionId });
    } catch (error) {
      console.error("[strava] publishing a retry failed:", error);
      await markStravaFailed(db, body.sessionId, "Couldn't queue the post");
      return NextResponse.json({ error: "Couldn't queue the post" }, { status: 502 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
