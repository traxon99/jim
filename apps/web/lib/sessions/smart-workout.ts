import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type SessionExerciseRow, type SessionRow, db } from "@/lib/db/schema";
import { buildMuscleVolumeSets } from "@/lib/history/muscle-volume-data";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type SmartWorkoutPlan,
  buildExerciseUsage,
  filterExercises,
  planSmartWorkout,
  preferOwnedExercises,
  resolveCurrentRows,
  uuidv7,
} from "@jim/core";

export const SMART_WORKOUT_NAME = "Smart workout";

/**
 * Plans a workout from what's in the local database (issue #280): recent
 * working sets per muscle, the user's exercise catalog, and how often
 * they've done each exercise. Reads only IndexedDB, so it works offline.
 */
async function planSmartWorkoutFromDb(
  userId: string,
  database: JimDatabase = db,
  now: Date = new Date(),
  options: { exerciseCount?: number; alreadyPickedIds?: readonly string[] } = {},
): Promise<SmartWorkoutPlan> {
  const [sessions, sessionExercises, sets, exercises] = await Promise.all([
    database.sessions.toArray(),
    database.sessionExercises.toArray(),
    database.sets.toArray(),
    database.exercises.toArray(),
  ]);

  // Warm-up sets aren't training volume, same as warm-up exercises.
  const workingSets = resolveCurrentRows(sets).filter((set) => set.kind !== "warmup");
  const volumeSets = buildMuscleVolumeSets(sessions, sessionExercises, exercises, workingSets);

  const liveSessions = new Map(
    sessions.filter((session) => !session.deletedAt).map((session) => [session.id, session]),
  );
  const usage = buildExerciseUsage(
    sessionExercises.flatMap((se) => {
      const session = liveSessions.get(se.sessionId);
      if (se.deletedAt || !session) return [];
      return [{ exerciseId: se.exerciseId, sessionId: se.sessionId, startedAt: session.startedAt }];
    }),
  );

  const candidates = filterExercises(preferOwnedExercises(exercises, userId), {
    category: "strength",
  });

  return planSmartWorkout({ now, sets: volumeSets, exercises: candidates, usage, ...options });
}

/** How many suggestions the Add exercise menu shows. */
const SUGGESTED_EXERCISE_COUNT = 3;

/**
 * Exercises to suggest in an ad hoc workout's Add exercise menu (issue
 * #226): the smart workout's picks for what this workout still leaves
 * under-trained, skipping the exercises already in it.
 */
export async function suggestExercisesFromDb(
  userId: string,
  workoutExerciseIds: readonly string[],
  database: JimDatabase = db,
  now: Date = new Date(),
): Promise<string[]> {
  const plan = await planSmartWorkoutFromDb(userId, database, now, {
    exerciseCount: SUGGESTED_EXERCISE_COUNT,
    alreadyPickedIds: workoutExerciseIds,
  });
  return plan.picks.map((pick) => pick.exerciseId);
}

/** Starts an ad hoc session pre-filled with the smart workout's exercises. */
export async function startSmartSession(
  userId: string,
  database: JimDatabase = db,
  now: Date = new Date(),
): Promise<string> {
  const plan = await planSmartWorkoutFromDb(userId, database, now);
  const deviceId = await getDeviceId(database);
  const session: SessionRow = {
    id: uuidv7(),
    userId,
    routineId: null,
    name: SMART_WORKOUT_NAME,
    startedAt: now,
    endedAt: null,
    notes: null,
    bodyweight: null,
    intensity: null,
    deviceId,
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("sessions", session, database);

  for (const [position, pick] of plan.picks.entries()) {
    const sessionExercise: SessionExerciseRow = {
      id: uuidv7(),
      userId,
      sessionId: session.id,
      exerciseId: pick.exerciseId,
      position,
      supersetGroup: null,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("sessionExercises", sessionExercise, database);
  }

  return session.id;
}
