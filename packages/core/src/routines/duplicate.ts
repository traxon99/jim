export interface DuplicateRoutineResult<TRoutine, TItem> {
  routine: TRoutine;
  items: TItem[];
}

/**
 * Duplicating a routine (STORIES.md S5) must not alias the original: every
 * row, the routine and each of its exercises, gets a fresh id. Sync
 * bookkeeping (`updatedAt`, `deviceId`) isn't this function's job — the
 * call site stamps that the same way `mutate()` expects for any write, per
 * the pattern in `applyExerciseEdit`.
 */
export function duplicateRoutine<
  TRoutine extends { id: string; userId: string; name: string },
  TItem extends { id: string; userId: string; routineId: string },
>(
  routine: TRoutine,
  items: readonly TItem[],
  userId: string,
  generateId: () => string,
): DuplicateRoutineResult<TRoutine, TItem> {
  const newRoutineId = generateId();

  const newRoutine: TRoutine = {
    ...routine,
    id: newRoutineId,
    userId,
    name: `${routine.name} copy`,
  };

  const newItems: TItem[] = items.map((item) => ({
    ...item,
    id: generateId(),
    userId,
    routineId: newRoutineId,
  }));

  return { routine: newRoutine, items: newItems };
}
