import { muscleEnum } from "../schema";

export const CONTROLLED_MUSCLES = new Set<string>(muscleEnum.enumValues);

export type Muscle = (typeof muscleEnum.enumValues)[number];

/**
 * free-exercise-db already uses a small, consistent muscle vocabulary, but
 * this still guards against upstream drift: an unrecognised value fails
 * loudly instead of silently landing a NULL-shaped catalog row.
 */
export function normalizeMuscle(raw: string): Muscle {
  const normalized = raw.trim().toLowerCase();
  if (!CONTROLLED_MUSCLES.has(normalized)) {
    throw new Error(`Unrecognised muscle "${raw}" — not in the controlled vocabulary`);
  }
  return normalized as Muscle;
}

export function normalizeMuscles(raw: readonly string[]): Muscle[] {
  return raw.map(normalizeMuscle);
}
