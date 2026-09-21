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
