export interface RoutineFolderGroup<T> {
  folder: string | null;
  routines: T[];
}

/**
 * Folders (STORIES.md S5) are a plain nullable string column, not a table
 * of their own — grouping is done in the read pipeline rather than by a
 * join. Ungrouped routines (`folder: null`) sort first, since that's the
 * common case for a catalog that starts empty; named folders then sort
 * alphabetically.
 */
export function groupRoutinesByFolder<T extends { folder: string | null; position: number }>(
  routines: readonly T[],
): RoutineFolderGroup<T>[] {
  const groups = new Map<string | null, T[]>();

  for (const routine of [...routines].sort((a, b) => a.position - b.position)) {
    const list = groups.get(routine.folder);
    if (list) {
      list.push(routine);
    } else {
      groups.set(routine.folder, [routine]);
    }
  }

  const entries = [...groups.entries()].sort(([a], [b]) => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a.localeCompare(b);
  });

  return entries.map(([folder, list]) => ({ folder, routines: list }));
}
