import { muscleTargetPath } from "./muscle-tree";
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

/** Which part of the body the map shows: all of it, or a crop. */
export type BodyMapView = "full" | "upper" | "lower";

const LOWER_BODY = new Set<string>([
  "glutes",
  "quadriceps",
  "hamstrings",
  "calves",
  "adductors",
  "abductors",
]);

/**
 * Crop to the upper or lower body when every shaded muscle sits there, so a
 * curl or a calf raise fills the map instead of shading a corner of it.
 * Anything spanning both halves (a deadlift) keeps the whole body.
 */
export function bodyMapView(shading: MuscleShading): BodyMapView {
  const shaded = Object.entries(shading)
    .filter(([, strength]) => (strength ?? 0) > 0)
    .map(([muscle]) => muscle);
  if (shaded.length === 0) return "full";
  const lower = shaded.filter((muscle) => LOWER_BODY.has(muscle)).length;
  if (lower === shaded.length) return "lower";
  if (lower === 0) return "upper";
  return "full";
}

/**
 * MuscleMap surfaces that are finer than Jim's groups, and the muscle tree
 * nodes each one stands for (issue #876). Every other surface shades as its
 * group does.
 */
export const DETAIL_SURFACES: Readonly<Record<string, readonly string[]>> = {
  SHOULDERS_FRONT: ["front_delt"],
  SHOULDERS_SIDE: ["side_delt"],
  SHOULDERS_REAR: ["rear_delt"],
  CORE: ["rectus_abdominis", "transversus_abdominis"],
  OBLIQUES: ["external_obliques", "internal_obliques"],
  // Drawn as the outer hip; the hip abductors are these two glutes now.
  ABDUCTORS: ["gluteus_medius", "gluteus_minimus"],
};

/**
 * One week's value for each detail surface: the most any of its nodes got,
 * plus the "Other" of every node above them, since work tagged only as
 * "shoulders" could have been any part of them. Never more than the group.
 * `byMuscle` keeps old rows still tagged with a retired group (abductors)
 * on the map.
 */
export function detailSurfaceValues(
  byTarget: Readonly<Record<string, number>>,
  otherByTarget: Readonly<Record<string, number>>,
  byMuscle: Readonly<Record<string, number>>,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [surface, nodes] of Object.entries(DETAIL_SURFACES)) {
    let value = Math.max(0, ...nodes.map((node) => byTarget[node] ?? 0));
    const ancestors = new Set(nodes.flatMap((node) => muscleTargetPath(node).slice(1)));
    for (const ancestor of ancestors) value += otherByTarget[ancestor] ?? 0;
    if (surface === "ABDUCTORS") value = Math.max(value, byMuscle.abductors ?? 0);
    if (value > 0) values[surface] = value;
  }
  return values;
}
