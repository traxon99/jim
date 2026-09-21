import { resolveCurrentRows } from "@jim/core";
import { exercises, personalRecords, sessionExercises, sessions, sets } from "@jim/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";

export class WorkoutNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`No workout found with id ${sessionId}.`);
  }
}

export async function getWorkout(context: UserContext, sessionId: string) {
  return withUser(context, async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session || session.deletedAt) throw new WorkoutNotFoundError(sessionId);

    const exerciseRows = await tx
      .select()
      .from(sessionExercises)
      .where(and(eq(sessionExercises.sessionId, sessionId), isNull(sessionExercises.deletedAt)))
      .orderBy(sessionExercises.position);

    const exerciseIds = exerciseRows.map((row) => row.exerciseId);
    const exerciseNames = exerciseIds.length
      ? new Map(
          (await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds))).map((e) => [
            e.id,
            e.name,
          ]),
        )
      : new Map<string, string>();

    const sessionExerciseIds = exerciseRows.map((row) => row.id);
    const setRows = sessionExerciseIds.length
      ? resolveCurrentRows(
          await tx.select().from(sets).where(inArray(sets.sessionExerciseId, sessionExerciseIds)),
        ).filter((set) => !set.deletedAt)
      : [];

    const setIds = setRows.map((set) => set.id);
    const prRows = setIds.length
      ? await tx
          .select()
          .from(personalRecords)
          .where(and(inArray(personalRecords.setId, setIds), isNull(personalRecords.deletedAt)))
      : [];
    const prKindsBySetId = new Map<string, string[]>();
    for (const pr of prRows) {
      if (!pr.setId) continue;
      const list = prKindsBySetId.get(pr.setId);
      if (list) list.push(pr.kind);
      else prKindsBySetId.set(pr.setId, [pr.kind]);
    }

    const setsBySessionExercise = new Map<string, typeof setRows>();
    for (const set of setRows) {
      const list = setsBySessionExercise.get(set.sessionExerciseId);
      if (list) list.push(set);
      else setsBySessionExercise.set(set.sessionExerciseId, [set]);
    }

    return {
      id: session.id,
      name: session.name,
      routineId: session.routineId,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      notes: session.notes,
      bodyweight: session.bodyweight == null ? null : Number(session.bodyweight),
      exercises: exerciseRows.map((row) => ({
        sessionExerciseId: row.id,
        exerciseId: row.exerciseId,
        exerciseName: exerciseNames.get(row.exerciseId) ?? "Unknown exercise",
        notes: row.notes,
        sets: (setsBySessionExercise.get(row.id) ?? [])
          .sort((a, b) => a.setIndex - b.setIndex)
          .map((set) => ({
            id: set.id,
            setIndex: set.setIndex,
            kind: set.kind,
            weight: set.weight == null ? null : Number(set.weight),
            reps: set.reps,
            durationSeconds: set.durationSeconds,
            distance: set.distance == null ? null : Number(set.distance),
            rpe: set.rpe == null ? null : Number(set.rpe),
            rir: set.rir,
            completedAt: set.completedAt.toISOString(),
            prKinds: prKindsBySetId.get(set.id) ?? [],
          })),
      })),
    };
  });
}
