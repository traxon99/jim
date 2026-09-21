import { mutate } from "@/lib/db/mutate";
import {
  type JimDatabase,
  type RoutineExerciseRow,
  type SessionExerciseRow,
  type SessionRow,
  db,
} from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { uuidv7 } from "@jim/core";

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
    deviceId,
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("sessions", session, database);
  return session.id;
}

/** Clones a routine's exercises onto a fresh session (targets stay on the routine; see routine-detail.tsx for the source data). */
export async function startSessionFromRoutine(
  userId: string,
  routine: { id: string; name: string },
  routineExercises: readonly RoutineExerciseRow[],
  database: JimDatabase = db,
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
    deviceId,
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("sessions", session, database);

  const items = [...routineExercises].sort((a, b) => a.position - b.position);
  for (const item of items) {
    const sessionExercise: SessionExerciseRow = {
      id: uuidv7(),
      userId,
      sessionId,
      exerciseId: item.exerciseId,
      position: item.position,
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
