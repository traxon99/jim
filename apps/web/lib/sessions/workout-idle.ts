import { type JimDatabase, type SessionRow, db } from "@/lib/db/schema";
import { lastWorkoutActivity, shouldAutoEnd } from "@jim/core";
import { finalizeSession } from "./finalize-session";

export interface ActiveWorkoutActivity {
  session: SessionRow;
  lastActivityAt: Date;
}

/**
 * The workouts in progress that this device owns (it started or last
 * changed them), each with its last activity (issue #648). Another device's
 * workout is left alone: its sets may not have synced here yet, so this
 * device can't tell whether it's really idle. Reads only, so it can run
 * inside a live query; the caller supplies the device id.
 */
export async function ownActiveWorkouts(
  deviceId: string,
  database: JimDatabase = db,
  now: Date = new Date(),
): Promise<ActiveWorkoutActivity[]> {
  const active = await database.sessions
    .filter((session) => !session.endedAt && !session.deletedAt && session.deviceId === deviceId)
    .toArray();
  const result: ActiveWorkoutActivity[] = [];
  for (const session of active) {
    const sessionExercises = await database.sessionExercises
      .where("sessionId")
      .equals(session.id)
      .toArray();
    const sets =
      sessionExercises.length > 0
        ? await database.sets
            .where("sessionExerciseId")
            .anyOf(sessionExercises.map((se) => se.id))
            .toArray()
        : [];
    const times = [
      session.updatedAt,
      ...sessionExercises.map((se) => se.updatedAt),
      ...sets.map((set) => set.completedAt),
    ];
    result.push({
      session,
      lastActivityAt: lastWorkoutActivity(times, session.startedAt, now),
    });
  }
  return result;
}

/**
 * Ends every workout this device owns that has sat idle past the user's
 * auto-end setting, dated to its last activity. Returns how many it ended.
 */
export async function autoEndIdleWorkouts(
  deviceId: string,
  autoEndMinutes: number | null,
  database: JimDatabase = db,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<number> {
  if (autoEndMinutes === null) return 0;
  let ended = 0;
  for (const { session, lastActivityAt } of await ownActiveWorkouts(deviceId, database, now)) {
    if (!shouldAutoEnd(lastActivityAt, autoEndMinutes, now)) continue;
    await finalizeSession(session, database, fetchImpl, lastActivityAt);
    ended++;
  }
  return ended;
}
