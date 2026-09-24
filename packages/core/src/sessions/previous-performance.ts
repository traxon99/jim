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
 * Every not-yet-logged set in a workout starts with a real weight already
 * filled in, rather than an empty field the lifter has to retype (issue #63,
 * extended by issue #121 to every row, not just the first): last time's
 * weight at this same position, when there is one. With no prior set at all
 * — the exercise's very first time being logged — `fallbackWeight` (a
 * routine's progressive-overload target for the top set, when configured)
 * fills the same role for set index 0 only; later sets in a brand-new
 * exercise have nothing to fall back on and stay blank.
 */
export function prefillWeightForSet(
  index: number,
  previous: PreviousSet | undefined,
  fallbackWeight?: number | null,
): string {
  if (previous?.weight != null) return String(previous.weight);
  if (index === 0 && fallbackWeight != null) return String(fallbackWeight);
  return "";
}

/**
 * Which not-yet-logged set rows an exercise should show right now: enough to
 * cover the routine's target and last time's set count (issue #121: preload
 * every set instead of drafting one at a time), plus one more once every
 * planned row has been logged, so there's always somewhere to log an extra
 * set. Never hides a row for a set skipped and logged out of order.
 */
export function plannedSetIndices(
  targetSetCount: number | null,
  previousSetCount: number,
  loggedIndices: ReadonlySet<number>,
): number[] {
  let total = Math.max(targetSetCount ?? 0, previousSetCount, 1);

  while (true) {
    const indices: number[] = [];
    for (let index = 0; index < total; index++) {
      if (!loggedIndices.has(index)) indices.push(index);
    }
    if (indices.length > 0 || loggedIndices.size === 0) return indices;
    total += 1;
  }
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
