/**
 * Working set timer (issue #634): how long each set itself took, from the
 * Start set tap to End set (or to the tap that logs it). Each set row stores
 * its own `workSeconds`; everything here is derived.
 */

/**
 * Longer than this isn't a set: the timer was left running (the phone went
 * back in a pocket, the workout was left open overnight). Such a time is
 * dropped rather than stored, so it can't skew the averages.
 */
export const MAX_WORK_SECONDS = 30 * 60;

/** Whole seconds from `startedAt` to `endedAt`, or null when it can't be a real set. */
export function workSecondsBetween(startedAt: Date, endedAt: Date): number | null {
  const seconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_WORK_SECONDS) return null;
  return seconds;
}

export interface WorkStatsSet {
  workSeconds?: number | null;
}

export interface WorkStats {
  /** Sets with a time recorded. */
  timedCount: number;
  averageWorkSeconds: number | null;
  totalWorkSeconds: number;
}

/** Set-time numbers across a session's (or an exercise's) sets. */
export function workStats(sets: readonly WorkStatsSet[]): WorkStats {
  let timedCount = 0;
  let totalWorkSeconds = 0;
  for (const set of sets) {
    if (set.workSeconds == null) continue;
    timedCount++;
    totalWorkSeconds += set.workSeconds;
  }
  return {
    timedCount,
    averageWorkSeconds: timedCount === 0 ? null : Math.round(totalWorkSeconds / timedCount),
    totalWorkSeconds,
  };
}

/** Seconds to get into position after Start set before tempo cues begin (issue #846). */
export const SET_READY_SECONDS = 10;

export type SetTimerReadoutPhase = "ready" | "running" | "ended";

export interface SetTimerReadout {
  phase: SetTimerReadoutPhase;
  /** Whole seconds of the set so far (running) or its time (ended); 0 while getting ready. */
  elapsed: number;
  /** Whole seconds left to get into position, rounded up; 0 once the set runs. */
  readyRemaining: number;
}

/**
 * What the set timer shows at `nowMs`. With tempo cues the set starts
 * `SET_READY_SECONDS` after the tap, so a start time still ahead is the
 * get-ready countdown; the set's own time counts from then.
 */
export function setTimerReadout(
  startedAtMs: number,
  endedAtMs: number | null,
  nowMs: number,
): SetTimerReadout {
  if (endedAtMs !== null) {
    return {
      phase: "ended",
      elapsed: Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000)),
      readyRemaining: 0,
    };
  }
  if (nowMs < startedAtMs) {
    return { phase: "ready", elapsed: 0, readyRemaining: Math.ceil((startedAtMs - nowMs) / 1000) };
  }
  return { phase: "running", elapsed: Math.floor((nowMs - startedAtMs) / 1000), readyRemaining: 0 };
}
