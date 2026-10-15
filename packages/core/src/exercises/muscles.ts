/**
 * The controlled vocabulary the seed catalog ships with (ADR-008), sourced
 * from free-exercise-db. Lives here (not packages/db) so client-side UI —
 * the exercise form's muscle picker — can import it without pulling in
 * packages/db's Postgres client code into a browser bundle.
 */
export const MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MISSING_PRIMARY_MUSCLE_ERROR =
  "Pick at least one primary muscle. Without one, this exercise's sets count toward no muscle's volume.";

/**
 * A strength exercise with no primary muscle counts toward nothing: the
 * Volume charts, the body map and the MCP volume tools all drop its sets
 * (issue #643). Warm-ups and cardio don't count toward volume, so they may
 * stay untagged. Returns the message to show, or null when the tags are fine.
 */
export function muscleTagsError(
  category: "strength" | "warmup" | "cardio" | null | undefined,
  primaryMuscles: readonly string[],
): string | null {
  const isStrength = category !== "warmup" && category !== "cardio";
  return isStrength && primaryMuscles.length === 0 ? MISSING_PRIMARY_MUSCLE_ERROR : null;
}

/**
 * A muscle is either primary or secondary, never both: volume counts a
 * primary muscle as a full set and a secondary one as half, so listing it
 * twice would count it one and a half times. Primary wins.
 */
export function withoutPrimary<M extends string>(
  secondaryMuscles: readonly M[],
  primaryMuscles: readonly M[],
): M[] {
  return secondaryMuscles.filter((muscle) => !primaryMuscles.includes(muscle));
}
