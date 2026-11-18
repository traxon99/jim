import { shouldPostToStrava } from "@jim/core";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { sessions, stravaActivities, stravaConnections } from "./schema";

/** A post that stayed `posting` this long crashed mid-call and may be claimed again. */
const STALE_POSTING_MINUTES = 5;

/**
 * Records the finished workouts that should go to Strava (issue #836) and
 * returns the ids newly queued, for the caller to publish a QStash message
 * each. Runs on the server's own connection (strava_activities has no RLS
 * policies), so `userId` must already be verified.
 *
 * A session qualifies when it's the user's, ended, not deleted, the user is
 * connected, the setting or the session's own `strava_post` says yes, and
 * (unless the workout was just logged, or the lifter asked for this one) it
 * ended after the connection was made, so history from before connecting is
 * never back-posted. A session already in strava_activities stays as it is,
 * which is what stops a double sync or a restore posting twice.
 */
export async function queueStravaPosts(
  db: DbOrTx,
  userId: string,
  sessionIds: readonly string[],
  options: { loggedNow?: boolean } = {},
): Promise<string[]> {
  if (sessionIds.length === 0) return [];
  const [connection] = await db
    .select({ autoPost: stravaConnections.autoPost, createdAt: stravaConnections.createdAt })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, userId));
  if (!connection) return [];

  const rows = await db
    .select({
      id: sessions.id,
      endedAt: sessions.endedAt,
      stravaPost: sessions.stravaPost,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        inArray(sessions.id, [...sessionIds]),
        isNull(sessions.deletedAt),
      ),
    );

  const due = rows.filter((row) => {
    if (!row.endedAt) return false;
    if (!shouldPostToStrava({ autoPost: connection.autoPost, stravaPost: row.stravaPost })) {
      return false;
    }
    if (row.stravaPost === true || options.loggedNow) return true;
    return row.endedAt.getTime() >= connection.createdAt.getTime();
  });
  if (due.length === 0) return [];

  const inserted = await db
    .insert(stravaActivities)
    .values(due.map((row) => ({ sessionId: row.id, userId })))
    .onConflictDoNothing()
    .returning({ sessionId: stravaActivities.sessionId });
  return inserted.map((row) => row.sessionId);
}

/** Puts a failed post back in the queue; the session ids it moved (empty when it wasn't failed). */
export async function requeueFailedStravaPost(
  db: DbOrTx,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const moved = await db
    .update(stravaActivities)
    .set({ status: "queued", error: null, attempts: 0, updatedAt: new Date() })
    .where(
      and(
        eq(stravaActivities.sessionId, sessionId),
        eq(stravaActivities.userId, userId),
        eq(stravaActivities.status, "failed"),
        isNull(stravaActivities.stravaActivityId),
      ),
    )
    .returning({ sessionId: stravaActivities.sessionId });
  return moved.length > 0;
}

/**
 * Takes the post for one workout (queued or failed → posting) in a single
 * statement, so concurrent or retried deliveries can't both call Strava.
 * Undefined when another delivery holds it, it's already posted, or there's
 * no row.
 */
export async function claimStravaPost(db: DbOrTx, sessionId: string) {
  const [claimed] = await db
    .update(stravaActivities)
    .set({
      status: "posting",
      attempts: sql`${stravaActivities.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stravaActivities.sessionId, sessionId),
        isNull(stravaActivities.stravaActivityId),
        or(
          inArray(stravaActivities.status, ["queued", "failed"]),
          and(
            eq(stravaActivities.status, "posting"),
            sql`${stravaActivities.updatedAt} < now() - make_interval(mins => ${STALE_POSTING_MINUTES})`,
          ),
        ),
      ),
    )
    .returning();
  return claimed;
}

export async function markStravaPosted(
  db: DbOrTx,
  sessionId: string,
  stravaActivityId: string,
): Promise<void> {
  await db
    .update(stravaActivities)
    .set({ status: "posted", stravaActivityId, error: null, updatedAt: new Date() })
    .where(eq(stravaActivities.sessionId, sessionId));
}

export async function markStravaFailed(
  db: DbOrTx,
  sessionId: string,
  error: string,
): Promise<void> {
  await db
    .update(stravaActivities)
    .set({ status: "failed", error: error.slice(0, 300), updatedAt: new Date() })
    .where(eq(stravaActivities.sessionId, sessionId));
}
