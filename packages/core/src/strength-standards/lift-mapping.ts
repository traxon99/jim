import type { StandardLift } from "./types";

/**
 * Canonical seed slugs for the four lifts standards are published for —
 * matches the same slugs curated in packages/db's seed/aliases.ts (the
 * existing convention for "which exercise row is the canonical one" for a
 * well-known lift). A user-cloned or custom exercise with a different slug
 * won't match; extending this to fuzzy name/alias matching is future work.
 */
const STANDARD_LIFT_SLUGS: Record<StandardLift, string> = {
  squat: "barbell-squat",
  benchPress: "barbell-bench-press-medium-grip",
  deadlift: "barbell-deadlift",
  overheadPress: "standing-military-press",
};

const SLUG_TO_STANDARD_LIFT: ReadonlyMap<string, StandardLift> = new Map(
  Object.entries(STANDARD_LIFT_SLUGS).map(([lift, slug]) => [slug, lift as StandardLift]),
);

/** Which published standard, if any, an exercise's seed slug corresponds to. */
export function standardLiftForSlug(slug: string | null | undefined): StandardLift | null {
  if (!slug) return null;
  return SLUG_TO_STANDARD_LIFT.get(slug) ?? null;
}
