export interface FocusExerciseCandidate {
  loggedSetCount: number;
  targetSetCount: number | null;
}

/**
 * Which exercise "focus mode" should land on: the first one not yet at its
 * target set count (or with zero sets logged when no target is set), i.e.
 * the exercise the lifter is presumably mid-way through. Falls back to the
 * last exercise once everything is at or past target.
 */
export function resolveFocusedExerciseIndex(candidates: readonly FocusExerciseCandidate[]): number {
  if (candidates.length === 0) return 0;
  const index = candidates.findIndex((c) => c.loggedSetCount < (c.targetSetCount ?? 1));
  return index === -1 ? candidates.length - 1 : index;
}
