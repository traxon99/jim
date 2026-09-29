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

/**
 * The global catalog has a few exact-name duplicates (issue #330), e.g.
 * "Ankle Circles" from both the free-exercise-db stretches and the curated
 * warm-ups. Among global rows sharing a name (case-insensitively), this
 * keeps one: the one the user has logged, else a curated warm-up
 * (`warmup-` slug), else the first. The user's own exercises are never
 * folded away.
 */
export function dedupeCatalogNames<T extends CatalogExercise>(
  exercises: readonly T[],
  usedIds: ReadonlySet<string> = new Set(),
): T[] {
  const rank = (exercise: T) =>
    (usedIds.has(exercise.id) ? 2 : 0) + (exercise.slug.startsWith("warmup-") ? 1 : 0);
  const keptByName = new Map<string, T>();
  for (const exercise of exercises) {
    if (exercise.ownerId !== null) continue;
    const key = exercise.name.trim().toLowerCase();
    const kept = keptByName.get(key);
    if (!kept || rank(exercise) > rank(kept)) keptByName.set(key, exercise);
  }
  return exercises.filter(
    (exercise) =>
      exercise.ownerId !== null || keptByName.get(exercise.name.trim().toLowerCase()) === exercise,
  );
}
