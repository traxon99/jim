export interface FocusExerciseCandidate {
  loggedSetCount: number;
  targetSetCount: number | null;
}

/**
 * Whether an exercise counts as done for focus-mode purposes: at or past its
 * target set count, or with at least one set logged when no target is set.
 */
export function isFocusExerciseComplete(candidate: FocusExerciseCandidate): boolean {
  return candidate.loggedSetCount >= (candidate.targetSetCount ?? 1);
}

/**
 * Which exercise "focus mode" should land on: the first one not yet at its
 * target set count (or with zero sets logged when no target is set), i.e.
 * the exercise the lifter is presumably mid-way through. Falls back to the
 * last exercise once everything is at or past target.
 */
export function resolveFocusedExerciseIndex(candidates: readonly FocusExerciseCandidate[]): number {
  if (candidates.length === 0) return 0;
  const index = candidates.findIndex((c) => !isFocusExerciseComplete(c));
  return index === -1 ? candidates.length - 1 : index;
}
