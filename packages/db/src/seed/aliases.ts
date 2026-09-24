/**
 * free-exercise-db ships no aliases field, so common gym-speak (short names,
 * abbreviations) is invisible to search unless curated here. Keyed by the
 * seed's own slug (see free-exercise-db.ts's slugify), not the raw dataset
 * id, since slug is the stable identifier once seeded.
 *
 * Deliberately small: the dataset has 47 exercises with "bench" in the name
 * alone, several genuinely named "Bench Press - <something>". An exact
 * alias match outranks a bare name-prefix match (see search.ts), which is
 * what actually makes "bench" resolve to the plain barbell bench press
 * instead of "Bench Press - Powerlifting" or "Bench Dips" — so this list
 * doubles as "which variant is the canonical one", not just abbreviation
 * expansion.
 */
export const EXERCISE_ALIASES: Record<string, readonly string[]> = {
  "barbell-bench-press-medium-grip": ["bench press", "bench"],
  "standing-military-press": ["ohp", "overhead press"],
  "barbell-squat": ["squat"],
  "barbell-deadlift": ["deadlift"],
  // Gym-speak from Maddy's Workout Split (issue #141).
  "hyperextensions-back-extensions": ["back extension"],
  "reverse-flyes": ["rear delt fly"],
  "lying-leg-curls": ["hamstring curl"],
  "thigh-abductor": ["abduction", "hip abduction"],
  "thigh-adductor": ["adduction", "hip adduction"],
  "wide-grip-lat-pulldown": ["lat pulldown", "lat pull down"],
  "one-arm-dumbbell-row": ["sa row", "single arm row"],
  "romanian-deadlift": ["rdl", "bb rdl"],
};
