import { mutate } from "@/lib/db/mutate";
import {
  type JimDatabase,
  type RoutineExerciseRow,
  type SessionExerciseRow,
  type SessionRow,
  db,
} from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { type SessionIntensity, isWarmupExercise, planSessionExercises, uuidv7 } from "@jim/core";

export async function startEmptySession(
  userId: string,
  database: JimDatabase = db,
): Promise<string> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const session: SessionRow = {
    id: uuidv7(),
    userId,
    routineId: null,
    name: null,
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
  return session.id;
}

/**
 * Clones a routine's exercises onto a fresh session (targets stay on the
 * routine; see routine-detail.tsx for the source data). A linked warm-up
 * routine's exercises are prepended and any warm-up exercises grouped at
 * the start (issue #59, see planSessionExercises).
 */
export async function startSessionFromRoutine(
  userId: string,
  routine: { id: string; name: string; warmupRoutineId?: string | null },
  routineExercises: readonly RoutineExerciseRow[],
  database: JimDatabase = db,
  /** The pre-workout sheet's "how hard today?" pick (issue #235); DPR users only. */
  intensity: SessionIntensity | null = null,
): Promise<string> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const sessionId = uuidv7();

  const session: SessionRow = {
    id: sessionId,
    userId,
    routineId: routine.id,
    name: routine.name,
    startedAt: now,
    endedAt: null,
    notes: null,
    bodyweight: null,
    intensity,
    deviceId,
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("sessions", session, database);

  const warmupRoutine = routine.warmupRoutineId
    ? await database.routines.get(routine.warmupRoutineId)
    : undefined;
  const warmupItems =
    warmupRoutine && !warmupRoutine.deletedAt
      ? (
          await database.routineExercises.where("routineId").equals(warmupRoutine.id).toArray()
        ).filter((item) => !item.deletedAt)
      : [];

  const exerciseIds = [...new Set([...routineExercises, ...warmupItems].map((i) => i.exerciseId))];
  const exercises = await database.exercises.bulkGet(exerciseIds);
  const warmupExerciseIds = new Set(
    exercises.filter((e) => e != null && isWarmupExercise(e)).map((e) => e?.id),
  );

  const plan = planSessionExercises(routineExercises, warmupItems, (id) =>
    warmupExerciseIds.has(id),
  );
  for (const { item, position } of plan) {
    const sessionExercise: SessionExerciseRow = {
      id: uuidv7(),
      userId,
      sessionId,
      exerciseId: item.exerciseId,
      position,
      supersetGroup: item.supersetGroup,
      notes: null,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("sessionExercises", sessionExercise, database);
  }

  return sessionId;
}
