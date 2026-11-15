/**
 * Exercise preference (issue #795, CONTEXT.md): the user's Like or Dislike
 * on an exercise, keyed by slug so it survives a copy-on-write clone
 * (ADR-008). No row, or a tombstoned one, is "none".
 *
 * - Like: smart workouts, the program generator and swap lists favour it.
 * - Dislike: they never pick it; it can still be added by hand, and swap
 *   lists show it last.
 */

export const EXERCISE_PREFERENCES = ["like", "dislike"] as const;

export type ExercisePreference = (typeof EXERCISE_PREFERENCES)[number];

export type ExercisePreferenceMap = ReadonlyMap<string, ExercisePreference>;

export function isExercisePreference(value: unknown): value is ExercisePreference {
  return value === "like" || value === "dislike";
}

export interface ExercisePreferenceRowLike {
  id?: string;
  exerciseSlug: string;
  preference: string;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Slug → preference from the user's rows. Two devices can each write a row
 * for the same slug offline, so the newest row wins; an exercise whose
 * newest row is tombstoned has no preference. Changing a preference can
 * tombstone one row and write another at the same instant, so on a tie the
 * live row wins, then the later uuidv7 id.
 */
export function buildExercisePreferenceMap(
  rows: readonly ExercisePreferenceRowLike[],
): Map<string, ExercisePreference> {
  const newest = new Map<string, ExercisePreferenceRowLike>();
  for (const row of rows) {
    const kept = newest.get(row.exerciseSlug);
    if (!kept || isNewer(row, kept)) {
      newest.set(row.exerciseSlug, row);
    }
  }
  const map = new Map<string, ExercisePreference>();
  for (const [slug, row] of newest) {
    if (!row.deletedAt && isExercisePreference(row.preference)) map.set(slug, row.preference);
  }
  return map;
}

function isNewer(row: ExercisePreferenceRowLike, kept: ExercisePreferenceRowLike): boolean {
  const diff = row.updatedAt.getTime() - kept.updatedAt.getTime();
  if (diff !== 0) return diff > 0;
  if (!row.deletedAt !== !kept.deletedAt) return !row.deletedAt;
  return (row.id ?? "") > (kept.id ?? "");
}

/** 1 for a like, -1 for a dislike, 0 otherwise. */
export function preferenceRank(
  preferences: ExercisePreferenceMap | undefined,
  slug: string,
): -1 | 0 | 1 {
  const preference = preferences?.get(slug);
  return preference === "like" ? 1 : preference === "dislike" ? -1 : 0;
}

/** Whether pickers (smart workouts, the generator, Claude) may choose it. */
export function isPickable(preferences: ExercisePreferenceMap | undefined, slug: string): boolean {
  return preferences?.get(slug) !== "dislike";
}

/**
 * Liked first, disliked last, otherwise the incoming order (a stable
 * partition), for swap lists like Replace.
 */
export function orderByPreference<T extends { slug: string }>(
  exercises: readonly T[],
  preferences: ExercisePreferenceMap | undefined,
): T[] {
  if (!preferences || preferences.size === 0) return [...exercises];
  return exercises
    .map((exercise, index) => ({ exercise, index }))
    .sort(
      (a, b) =>
        preferenceRank(preferences, b.exercise.slug) -
          preferenceRank(preferences, a.exercise.slug) || a.index - b.index,
    )
    .map(({ exercise }) => exercise);
}
