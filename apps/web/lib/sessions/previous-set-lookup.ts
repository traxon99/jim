import { type JimDatabase, db } from "@/lib/db/schema";
import {
  type PreviousSet,
  type PreviousSetsByKind,
  findPreviousSessionExerciseId,
  resolveCurrentRows,
  splitPreviousSets,
} from "@jim/core";

export const NO_PREVIOUS_SETS: PreviousSetsByKind = { warmups: [], working: [] };

/**
 * "Previous-session values shown inline on each row as the number to beat"
 * (STORIES.md S6) — finds the most recent session (other than the one in
 * progress) that trained this exercise, and splits its sets into warm-ups
 * and working sets so a row can show what happened at the same spot last
 * time.
 */
export async function loadPreviousSets(
  exerciseId: string,
  currentSessionId: string,
  database: JimDatabase = db,
): Promise<PreviousSetsByKind> {
  const sessionExercises = (
    await database.sessionExercises.where("exerciseId").equals(exerciseId).toArray()
  ).filter((se) => !se.deletedAt);
  if (sessionExercises.length === 0) return NO_PREVIOUS_SETS;

  const sessionIds = [...new Set(sessionExercises.map((se) => se.sessionId))];
  const sessions = await database.sessions.bulkGet(sessionIds);
  const sessionById = new Map(sessions.filter((s) => s != null).map((s) => [s.id, s]));

  const candidates = sessionExercises.flatMap((se) => {
    const session = sessionById.get(se.sessionId);
    if (!session || session.deletedAt) return [];
    return [{ id: se.id, sessionId: se.sessionId, startedAt: session.startedAt }];
  });

  const previousSessionExerciseId = findPreviousSessionExerciseId(candidates, currentSessionId);
  if (!previousSessionExerciseId) return NO_PREVIOUS_SETS;

  const rawSets = await database.sets
    .where("sessionExerciseId")
    .equals(previousSessionExerciseId)
    .toArray();

  const previousSets: PreviousSet[] = resolveCurrentRows(rawSets)
    .filter((set) => !set.deletedAt)
    .map((set) => ({
      setIndex: set.setIndex,
      kind: set.kind,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      completedAt: set.completedAt,
    }));

  return splitPreviousSets(previousSets);
}
