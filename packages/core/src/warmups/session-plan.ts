export interface PlannableRoutineItem {
  exerciseId: string;
  position: number;
}

/**
 * The exercise order a session starts with (issue #59): the linked warm-up
 * routine's exercises first, then any warm-up exercises added directly to
 * the routine, then the rest — so everything warm-up sits together as one
 * block at the start of the workout. Relative order within each group is
 * kept. An exercise that appears in both the warm-up routine and the
 * routine itself is only included once, at its first (warm-up) position.
 */
export function planSessionExercises<T extends PlannableRoutineItem>(
  routineItems: readonly T[],
  warmupRoutineItems: readonly T[],
  isWarmupExerciseId: (exerciseId: string) => boolean,
): { item: T; position: number; isWarmup: boolean }[] {
  const byPosition = (a: T, b: T) => a.position - b.position;
  const own = [...routineItems].sort(byPosition);
  const ordered: { item: T; isWarmup: boolean }[] = [
    ...[...warmupRoutineItems].sort(byPosition).map((item) => ({ item, isWarmup: true })),
    ...own
      .filter((item) => isWarmupExerciseId(item.exerciseId))
      .map((item) => ({ item, isWarmup: true })),
    ...own
      .filter((item) => !isWarmupExerciseId(item.exerciseId))
      .map((item) => ({ item, isWarmup: false })),
  ];

  const seen = new Set<string>();
  const result: { item: T; position: number; isWarmup: boolean }[] = [];
  for (const entry of ordered) {
    if (seen.has(entry.item.exerciseId)) continue;
    seen.add(entry.item.exerciseId);
    result.push({ ...entry, position: result.length });
  }
  return result;
}

/**
 * Splits a session's (already position-sorted) exercises into the warm-up
 * block and the main workout, for display. Keyed on the exercise's
 * category rather than where it sits, so a warm-up added mid-workout still
 * lands in the warm-up group.
 */
export function partitionWarmups<T extends { exerciseId: string }>(
  items: readonly T[],
  isWarmupExerciseId: (exerciseId: string) => boolean,
): { warmups: T[]; main: T[] } {
  const warmups: T[] = [];
  const main: T[] = [];
  for (const item of items) {
    (isWarmupExerciseId(item.exerciseId) ? warmups : main).push(item);
  }
  return { warmups, main };
}
