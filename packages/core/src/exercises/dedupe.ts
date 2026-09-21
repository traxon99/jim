import type { CatalogExercise } from "./types";

/**
 * ADR-008: editing a global seed row (owner_id IS NULL) clones it into a
 * user-owned row rather than mutating it, and the two coexist under the
 * same slug. Catalog views should show only one — the user's own clone
 * where it exists, the global row otherwise — everywhere except the raw
 * "every row I can see" query.
 */
export function preferOwnedExercises<T extends CatalogExercise>(
  exercises: readonly T[],
  userId: string,
): T[] {
  // RLS (exercises_select_own_or_global) guarantees a query for this user
  // never actually returns anyone else's owned row — but this function
  // shouldn't rely on that to stay correct. Anything that isn't global or
  // this user's own passes through untouched rather than being folded (and
  // potentially dropped) by slug.
  const bySlug = new Map<string, T>();
  const other: T[] = [];

  for (const exercise of exercises) {
    if (exercise.ownerId !== null && exercise.ownerId !== userId) {
      other.push(exercise);
      continue;
    }
    const current = bySlug.get(exercise.slug);
    if (!current || exercise.ownerId === userId) {
      bySlug.set(exercise.slug, exercise);
    }
  }

  return [...bySlug.values(), ...other];
}
