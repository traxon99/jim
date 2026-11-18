import { isUuid, unauthenticatedOrThrow } from "@/lib/api/route-helpers";
import { serviceDb } from "@/lib/db/user-scoped";
import { requireUserId } from "@/lib/strava/auth";
import type { StravaPostInfo } from "@jim/core";
import { stravaActivities } from "@jim/db";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

const MAX_IDS = 100;

/**
 * Strava post status for the workouts on screen (issue #836): History rows and
 * the finish screen. Server data like friends: online-only, never in IndexedDB.
 * `?session_ids=a,b,c` → `{ activities: { [sessionId]: { status, activityId } } }`;
 * workouts with no row are left out.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("session_ids") ?? "";
  const ids = [...new Set(raw.split(",").filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every(isUuid)) {
    return NextResponse.json(
      { error: `Expected 1 to ${MAX_IDS} session_ids, comma separated` },
      { status: 400 },
    );
  }
  try {
    const userId = await requireUserId();
    const rows = await serviceDb()
      .select({
        sessionId: stravaActivities.sessionId,
        status: stravaActivities.status,
        activityId: stravaActivities.stravaActivityId,
      })
      .from(stravaActivities)
      .where(and(eq(stravaActivities.userId, userId), inArray(stravaActivities.sessionId, ids)));
    const activities: Record<string, StravaPostInfo> = {};
    for (const row of rows) {
      activities[row.sessionId] = {
        status: row.status as StravaPostInfo["status"],
        activityId: row.activityId,
      };
    }
    return NextResponse.json({ activities });
  } catch (error) {
    return unauthenticatedOrThrow(error);
  }
}
