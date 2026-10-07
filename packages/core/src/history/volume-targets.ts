/**
 * What the lifter is training a muscle for (issue #395). The two goals need
 * very different amounts of weekly work, so the Volume by muscle screen
 * checks each muscle's weekly sets against the range for the chosen goal.
 */
export type TrainingGoal = "strength" | "hypertrophy";

export const TRAINING_GOALS: readonly TrainingGoal[] = ["strength", "hypertrophy"];

export interface WeeklySetRange {
  /** Fewest weekly working sets that count as enough. */
  min: number;
  /** Most weekly working sets before returns flatten out. */
  max: number;
}

/**
 * Weekly working sets per muscle, counted the way `weeklyVolumeByMuscle`
 * counts them (a secondary muscle gets half a set, the "fractional" method
 * Pelland et al. found fit the data best). One range for every muscle: the
 * research doesn't support per-muscle numbers.
 *
 * - Hypertrophy, 10–20: Schoenfeld, Ogborn & Krieger (2017) found growth
 *   rises with volume up to their 10+ sets bin; Baz-Valle et al. (2022)
 *   put the optimum for trained lifters at 12–20, with little extra from
 *   more than 20; Pelland et al. (2026) show growth keeps rising with
 *   volume but with diminishing returns.
 * - Strength, 5–10: Ralston et al. (2017) found 5–9 weekly sets beat fewer
 *   than 5, with only a small edge for 10+; Pelland et al. (2026) found
 *   strength's returns flatten far sooner than hypertrophy's, so past ~10
 *   sets frequency and heavy practice matter more than adding sets.
 *
 * Full reasoning and sources: docs/VOLUME-TARGETS.md.
 */
export const WEEKLY_SET_TARGETS: Readonly<Record<TrainingGoal, WeeklySetRange>> = {
  strength: { min: 5, max: 10 },
  hypertrophy: { min: 10, max: 20 },
};

export type WeeklySetStatus = "under" | "within" | "over";

/** Where a muscle's weekly working sets sit against the goal's range. */
export function weeklySetStatus(sets: number, goal: TrainingGoal): WeeklySetStatus {
  const range = WEEKLY_SET_TARGETS[goal];
  if (sets < range.min) return "under";
  if (sets > range.max) return "over";
  return "within";
}

/** Per-muscle status for one week's `setsByMuscle`. */
export function weeklySetStatusByMuscle(
  setsByMuscle: Readonly<Record<string, number>>,
  goal: TrainingGoal,
): Record<string, WeeklySetStatus> {
  const result: Record<string, WeeklySetStatus> = {};
  for (const [muscle, sets] of Object.entries(setsByMuscle)) {
    result[muscle] = weeklySetStatus(sets, goal);
  }
  return result;
}
