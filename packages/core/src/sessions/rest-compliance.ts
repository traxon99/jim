/**
 * Rest compliance (issue #233): how much rest was actually taken before each
 * set, against the rest the timer was counting down. Each set row stores
 * both (`restSeconds`, `restTargetSeconds`); everything here is derived.
 */

/** A rest under this fraction of its target counts as short (skipped). */
export const SHORT_REST_FRACTION = 0.8;

/** Whole seconds between the previous set and this one, never negative. */
export function restTakenSeconds(previousCompletedAt: Date, completedAt: Date): number {
  return Math.max(0, Math.round((completedAt.getTime() - previousCompletedAt.getTime()) / 1000));
}

/** True when both are known and the rest fell short of the target. */
export function isShortRest(
  restSeconds: number | null | undefined,
  restTargetSeconds: number | null | undefined,
): boolean {
  if (restSeconds == null || restTargetSeconds == null || restTargetSeconds <= 0) return false;
  return restSeconds < restTargetSeconds * SHORT_REST_FRACTION;
}

export interface RestStatsSet {
  restSeconds: number | null;
  restTargetSeconds: number | null;
}

export interface RestStats {
  /** Sets with both a rest and a target recorded. */
  restCount: number;
  shortCount: number;
  averageRestSeconds: number | null;
  averageTargetSeconds: number | null;
}

/** Rest numbers across a session's (or an exercise's) sets. */
export function restStats(sets: readonly RestStatsSet[]): RestStats {
  let restCount = 0;
  let shortCount = 0;
  let restTotal = 0;
  let targetTotal = 0;
  for (const set of sets) {
    if (set.restSeconds == null || set.restTargetSeconds == null) continue;
    restCount++;
    restTotal += set.restSeconds;
    targetTotal += set.restTargetSeconds;
    if (isShortRest(set.restSeconds, set.restTargetSeconds)) shortCount++;
  }
  return {
    restCount,
    shortCount,
    averageRestSeconds: restCount === 0 ? null : Math.round(restTotal / restCount),
    averageTargetSeconds: restCount === 0 ? null : Math.round(targetTotal / restCount),
  };
}

/** "1:30", "45s" — for rest readouts. */
export function formatRestSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
