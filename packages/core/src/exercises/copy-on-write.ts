export interface CopyOnWriteResult<T> {
  action: "update" | "clone";
  entity: T;
}

/**
 * ADR-008: editing a global seed row (owner_id IS NULL) never mutates it —
 * it clones into a new, user-owned row under the same slug, and the clone
 * is what changes going forward. Editing an already-owned row (a previous
 * clone, or a custom exercise) just updates it in place.
 *
 * Archiving goes through this too: "archiving" a global exercise means
 * "archived for me", which is exactly a clone with `isArchived: true` —
 * not a special case.
 *
 * Sync bookkeeping (`updatedAt`, `deviceId`) isn't this function's job —
 * every `mutate()` call site stamps that the same way regardless of table,
 * so it belongs there, not duplicated into every business-logic helper.
 */
export function applyExerciseEdit<T extends { id: string; ownerId: string | null }>(
  current: T,
  edits: Partial<T>,
  userId: string,
  generateId: () => string,
): CopyOnWriteResult<T> {
  const merged = { ...current, ...edits };

  if (current.ownerId === userId) {
    return { action: "update", entity: merged };
  }

  return { action: "clone", entity: { ...merged, id: generateId(), ownerId: userId } };
}
