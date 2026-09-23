export type ProgressionMechanic = "compound" | "isolation" | null;

/**
 * Default weekly load increase for a "configure it once and let it run"
 * progressive-overload target, by exercise mechanic. Compound lifts recover
 * faster relative to the load and progress faster under a novice linear
 * program; isolation work is progressed more conservatively. Figures follow
 * the widely-used novice linear-progression guidance in Rippetoe's
 * *Starting Strength* and the NSCA's *Essentials of Strength Training and
 * Conditioning* (small, session-to-session jumps on the big barbell lifts,
 * smaller ones on accessory/isolation work) — a sane starting point a
 * lifter can override, not a guarantee a lift keeps progressing forever.
 */
export function suggestedWeeklyIncrement(
  mechanic: ProgressionMechanic,
  units: "lb" | "kg",
): number {
  const isCompound = mechanic === "compound";
  if (units === "kg") return isCompound ? 2.5 : 1;
  return isCompound ? 5 : 2.5;
}

export interface WeeklyProgressionConfig {
  /** The working weight the progression was set up from. */
  targetWeight: number;
  /** Added once per full week elapsed since `progressionStartedAt`. null/0 = disabled. */
  progressionIncrement: number | null;
  /** When the current `targetWeight` became the baseline to progress from. */
  progressionStartedAt: Date | null;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * The working weight a progressive-overload configuration calls for right
 * now — the baseline plus one increment for every full week elapsed since
 * progression started, so the suggested number keeps climbing on its own
 * without the lifter having to come back and edit the routine each week.
 * Never goes backward: a config with no increment (or no start date) just
 * returns the baseline.
 */
export function currentProgressedWeight(config: WeeklyProgressionConfig, now: Date): number {
  const { targetWeight, progressionIncrement, progressionStartedAt } = config;
  if (!progressionIncrement || !progressionStartedAt) return targetWeight;

  const elapsedWeeks = Math.max(
    0,
    Math.floor((now.getTime() - progressionStartedAt.getTime()) / MS_PER_WEEK),
  );
  return targetWeight + progressionIncrement * elapsedWeeks;
}
