import type { Muscle } from "./muscles";

/**
 * How strongly to shade each muscle on the body map (issue #252), 0–1.
 * Muscles left out aren't highlighted.
 */
export type MuscleShading = Partial<Record<Muscle, number>>;

/** An exercise's muscles: primary at full strength, secondary at half. */
export function exerciseMuscleShading(exercise: {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
}): MuscleShading {
  const shading: Record<string, number> = {};
  for (const muscle of exercise.secondaryMuscles) shading[muscle] = 0.45;
  for (const muscle of exercise.primaryMuscles) shading[muscle] = 1;
  return shading as MuscleShading;
}

/**
 * A heatmap of per-muscle values (sets or volume), each scaled against `max`
 * so one week's map can be compared to another's on the same scale. Any
 * trained muscle gets at least a faint tint, so it never reads as untouched.
 */
export function heatmapShading(
  values: Readonly<Record<string, number>>,
  max: number,
): MuscleShading {
  const shading: Record<string, number> = {};
  if (max <= 0) return shading as MuscleShading;
  for (const [muscle, value] of Object.entries(values)) {
    if (value <= 0) continue;
    shading[muscle] = Math.max(0.15, Math.min(1, value / max));
  }
  return shading as MuscleShading;
}
