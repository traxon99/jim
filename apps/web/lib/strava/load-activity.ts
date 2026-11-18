import { serviceDb } from "@/lib/db/user-scoped";
import { type StravaActivity, stravaActivityFor } from "@jim/core";
import { exercises, personalRecords, sessionExercises, sessions, sets, users } from "@jim/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * The finished workout as a Strava activity (issue #836), read on the
 * server's own connection: the post job has no signed-in user, only the
 * QStash-signed session id this server wrote. Null when the workout is gone
 * (deleted, unfinished, or not that user's).
 */
export async function loadStravaActivity(
  userId: string,
  sessionId: string,
): Promise<{ activity: StravaActivity; stravaPost: boolean | null } | null> {
  const db = serviceDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.deletedAt)),
    );
  if (!session?.endedAt) return null;

  const [user] = await db
    .select({ units: users.units, timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, userId));

  const sessionExerciseRows = await db
    .select({
      sessionExerciseId: sessionExercises.id,
      exerciseId: sessionExercises.exerciseId,
      position: sessionExercises.position,
      name: exercises.name,
      slug: exercises.slug,
      category: exercises.category,
      trackingType: exercises.trackingType,
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(and(eq(sessionExercises.sessionId, sessionId), isNull(sessionExercises.deletedAt)));

  const setRows =
    sessionExerciseRows.length === 0
      ? []
      : await db
          .select()
          .from(sets)
          .where(
            inArray(
              sets.sessionExerciseId,
              sessionExerciseRows.map((row) => row.sessionExerciseId),
            ),
          );
  const prRows =
    setRows.length === 0
      ? []
      : await db
          .select({
            setId: personalRecords.setId,
            kind: personalRecords.kind,
            exerciseId: personalRecords.exerciseId,
            deletedAt: personalRecords.deletedAt,
          })
          .from(personalRecords)
          .where(
            and(
              eq(personalRecords.userId, userId),
              inArray(
                personalRecords.setId,
                setRows.map((set) => set.id),
              ),
            ),
          );

  const activity = stravaActivityFor({
    session: { name: session.name, startedAt: session.startedAt, endedAt: session.endedAt },
    exercises: sessionExerciseRows,
    sets: setRows,
    prs: prRows,
    units: user?.units === "kg" ? "kg" : "lb",
    timeZone: user?.timeZone,
  });
  return { activity, stravaPost: session.stravaPost };
}
