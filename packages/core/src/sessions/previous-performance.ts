export interface PreviousSet {
  setIndex: number;
  kind: string;
  weight: number | null;
  reps: number | null;
  completedAt: Date;
}

/**
 * "Previous-session values shown inline on each row as the number to beat"
 * (STORIES.md S6) — indexes one prior session's sets by their position in
 * the exercise so a row being logged now can look up what happened at the
 * same position last time. The caller is responsible for picking which
 * session counts as "previous" (most recent session, before the current
 * one, that included this exercise) and for resolving supersede chains and
 * tombstones first.
 */
export function mapPreviousSetsByIndex(sets: readonly PreviousSet[]): Map<number, PreviousSet> {
  const byIndex = new Map<number, PreviousSet>();
  for (const set of sets) {
    byIndex.set(set.setIndex, set);
  }
  return byIndex;
}

/**
 * Groups sets by `sessionExerciseId` and, given the exercise's own history
 * ordered newest-first, picks the most recent group that isn't the session
 * currently in progress — the "previous session" for this exercise.
 */
export function findPreviousSessionExerciseId(
  sessionExercises: readonly { id: string; sessionId: string; startedAt: Date }[],
  currentSessionId: string,
): string | null {
  const candidates = sessionExercises
    .filter((se) => se.sessionId !== currentSessionId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return candidates[0]?.id ?? null;
}
