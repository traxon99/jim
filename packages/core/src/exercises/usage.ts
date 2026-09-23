import type { CatalogExercise } from "./types";

export interface ExerciseUsage {
  lastPerformedAt: Date;
  /** Count of distinct sessions the exercise was performed in. */
  frequency: number;
}

/**
 * Per-exercise usage stats from a caller-flattened join of (non-deleted)
 * sessionExercises with their (non-deleted) session's startedAt — same
 * shape `findPreviousSessionExerciseId` and previous-set-lookup.ts build.
 * An exercise with no rows here has never been performed and is left out
 * of the returned map rather than given a zero/null entry.
 */
export function buildExerciseUsage(
  sessionExercises: readonly { exerciseId: string; sessionId: string; startedAt: Date }[],
): Map<string, ExerciseUsage> {
  const sessionIdsByExercise = new Map<string, Set<string>>();
  const lastPerformedByExercise = new Map<string, Date>();

  for (const se of sessionExercises) {
    let sessionIds = sessionIdsByExercise.get(se.exerciseId);
    if (!sessionIds) {
      sessionIds = new Set();
      sessionIdsByExercise.set(se.exerciseId, sessionIds);
    }
    sessionIds.add(se.sessionId);

    const lastPerformedAt = lastPerformedByExercise.get(se.exerciseId);
    if (!lastPerformedAt || se.startedAt > lastPerformedAt) {
      lastPerformedByExercise.set(se.exerciseId, se.startedAt);
    }
  }

  const usage = new Map<string, ExerciseUsage>();
  for (const [exerciseId, sessionIds] of sessionIdsByExercise) {
    const lastPerformedAt = lastPerformedByExercise.get(exerciseId);
    if (!lastPerformedAt) continue;
    usage.set(exerciseId, { lastPerformedAt, frequency: sessionIds.size });
  }
  return usage;
}

export type ExerciseSortKey = "name" | "lastPerformed" | "frequency";

/**
 * Never-performed exercises have no usage entry and sort to the end under
 * "lastPerformed"/"frequency" (still ordered by name among themselves);
 * ties within a sort key also fall back to name so the order is stable.
 */
export function sortExercisesByUsage<T extends CatalogExercise>(
  exercises: readonly T[],
  usageByExerciseId: ReadonlyMap<string, ExerciseUsage>,
  sortKey: ExerciseSortKey,
): T[] {
  return [...exercises].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name);

    const usageA = usageByExerciseId.get(a.id);
    const usageB = usageByExerciseId.get(b.id);

    if (sortKey === "lastPerformed") {
      const timeA = usageA?.lastPerformedAt.getTime() ?? Number.NEGATIVE_INFINITY;
      const timeB = usageB?.lastPerformedAt.getTime() ?? Number.NEGATIVE_INFINITY;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name);
    }

    const frequencyA = usageA?.frequency ?? 0;
    const frequencyB = usageB?.frequency ?? 0;
    if (frequencyA !== frequencyB) return frequencyB - frequencyA;
    return a.name.localeCompare(b.name);
  });
}
