/**
 * Reordering (STORIES.md S5) moves one exercise to sit right after another
 * and renumbers `position` for the whole list, so the persisted order
 * survives a restart (`position` is a plain integer column, not an
 * implicit array index). Operates on ids rather than array indices so a
 * drag library's "this item was dropped over that one" event maps directly
 * onto the call, regardless of what order the list happened to render in.
 */
export function reorderRoutineExercises<T extends { id: string; position: number }>(
  items: readonly T[],
  activeId: string,
  overId: string,
): T[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const fromIndex = ordered.findIndex((item) => item.id === activeId);
  const toIndex = ordered.findIndex((item) => item.id === overId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return ordered;
  }

  const [moved] = ordered.splice(fromIndex, 1);
  if (!moved) return ordered;
  ordered.splice(toIndex, 0, moved);

  return ordered.map((item, index) => ({ ...item, position: index }));
}

/**
 * Puts `items` in the order `orderedIds` lists them (issue #658), reusing the
 * items' own positions so anything outside `items` (a workout's warm-ups)
 * keeps its place. Positions are bumped where needed to stay strictly
 * increasing, so two items that shared a position get a definite order.
 * Items missing from `orderedIds` keep their relative order after the rest.
 */
export function applyItemOrder<T extends { id: string; position: number }>(
  items: readonly T[],
  orderedIds: readonly string[],
): T[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const ordered = [...sorted].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.POSITIVE_INFINITY) - (rank.get(b.id) ?? Number.POSITIVE_INFINITY),
  );
  let previous = Number.NEGATIVE_INFINITY;
  return ordered.map((item, index) => {
    const slot = sorted[index]?.position ?? index;
    const position = Math.max(slot, previous + 1);
    previous = position;
    return { ...item, position };
  });
}
