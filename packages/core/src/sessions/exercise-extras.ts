/**
 * Pure logic behind the exercise ⋯ menu's per-workout extras (issue #271):
 * warm-up sets planned ahead of the working sets, and the sticky note that
 * follows an exercise from one workout to the next.
 */

export interface WarmupRampSet {
  /** Total weight on the bar, or null when there's no working weight to ramp to. */
  weight: number | null;
  reps: number;
}

/** Percent of the working weight and reps for each warm-up set, lightest first. */
const RAMP: readonly { percent: number; reps: number }[] = [
  { percent: 0.4, reps: 5 },
  { percent: 0.6, reps: 3 },
  { percent: 0.8, reps: 2 },
];

/** How many warm-up sets "Add Warm-up Sets" plans. */
export const WARMUP_RAMP_SET_COUNT = RAMP.length;

/**
 * The warm-up ramp toward `workingWeight`: 40% × 5, 60% × 3, 80% × 2, each
 * rounded down to `increment` (5 lb / 2.5 kg jumps) and never below the empty
 * bar. With no working weight to aim at, only the reps are suggested.
 */
export function warmupRamp(
  workingWeight: number | null,
  barWeight: number,
  increment: number,
): WarmupRampSet[] {
  return RAMP.map(({ percent, reps }) => {
    if (workingWeight == null || !Number.isFinite(workingWeight) || workingWeight <= 0) {
      return { weight: null, reps };
    }
    const step = increment > 0 ? increment : 1;
    const rounded = Math.floor((workingWeight * percent) / step + 1e-9) * step;
    const floor = Math.min(barWeight, workingWeight);
    return { weight: Math.max(Number(rounded.toFixed(2)), floor), reps };
  });
}

export interface StickyNoteSource {
  stickyNote: string | null;
  startedAt: Date;
}

/**
 * The sticky note to show for an exercise in a workout: the workout's own
 * value when it has one (an empty string means it was cleared there),
 * otherwise the newest earlier workout's that set or cleared it. Returns
 * null when there's nothing to show.
 */
export function resolveStickyNote(
  own: string | null,
  earlier: readonly StickyNoteSource[],
): string | null {
  if (own !== null) return own.trim() === "" ? null : own;
  const newest = earlier
    .filter((source) => source.stickyNote !== null)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  const note = newest?.stickyNote ?? null;
  return note === null || note.trim() === "" ? null : note;
}
