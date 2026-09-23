/**
 * Workout pace (issue #37): how the lifter's progress through the session
 * compares to a time budget built from the plan itself — each set gets a
 * fixed working allowance plus that exercise's rest, and switching to a new
 * exercise gets a setup allowance. Everything derives from `startedAt`,
 * each set's `completedAt` and `now` (never accumulated ticks — same reason
 * as the rest timer, docs/ARCHITECTURE.md §2), so a backgrounded app comes
 * back to the right answer.
 *
 * Resting doesn't earn credit and doesn't cost anything: after a set is
 * logged the lifter is only "late" once the gap exceeds the planned rest +
 * next set. Finishing sets faster than the plan reads as "ahead", which the
 * UI frames as "take your full rest" rather than as a win — the tracker
 * should keep people moving without encouraging rushing.
 */

/** Seconds budgeted to actually perform one set. */
export const PACE_WORK_SECONDS_PER_SET = 45;
/** Seconds budgeted before the first set of the workout (warm-up / setup). */
export const PACE_WORKOUT_SETUP_SECONDS = 180;
/** Seconds budgeted to move to (and set up) each subsequent exercise. */
export const PACE_EXERCISE_TRANSITION_SECONDS = 90;
/** Sets assumed for an exercise with no target set count (e.g. an ad-hoc session). */
export const PACE_DEFAULT_UNPLANNED_SETS = 3;

export interface PaceExercise {
  /** Routine target set count, or null when there's no target. */
  targetSetCount: number | null;
  /** Planned rest after each of this exercise's sets. */
  restSeconds: number;
  /** When each of this exercise's (current, non-deleted) sets was logged. */
  setCompletedAt: readonly Date[];
}

export interface PaceInput {
  startedAt: Date;
  now: Date;
  /** In session order. */
  exercises: readonly PaceExercise[];
}

export type PaceStatus = "on-pace" | "behind" | "ahead" | "done";

export interface PacePoint {
  /** Seconds since the workout started. */
  seconds: number;
  /** Cumulative sets completed at that moment. */
  sets: number;
}

export interface PaceSnapshot {
  status: PaceStatus;
  /** Positive = behind plan, negative = ahead of plan. */
  deltaSeconds: number;
  /** How far either side of the plan still counts as "on pace". */
  toleranceSeconds: number;
  elapsedSeconds: number;
  plannedTotalSeconds: number;
  /** Plan total adjusted by the current drift — drives "estimated finish". */
  projectedTotalSeconds: number;
  setsDone: number;
  setsPlanned: number;
  /** True while the lifter has gone past the planned rest + next set without logging. */
  overdue: boolean;
  /** The planned burn-up line: when each set is due, starting at (0, 0). */
  plan: PacePoint[];
  /** The actual burn-up steps: each logged set, starting at (0, 0). */
  actual: PacePoint[];
}

function secondsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 1000;
}

/** Null when there's nothing to pace yet (no exercises in the session). */
export function computePace(input: PaceInput): PaceSnapshot | null {
  const { startedAt, now, exercises } = input;
  if (exercises.length === 0) return null;

  // Planned completion time (seconds from start) of each set, in order.
  // Sets logged beyond the target extend the plan rather than reading as
  // "behind" — doing extra work isn't falling off pace.
  const due: number[] = [];
  let clock = 0;
  let previousRest: number | null = null;
  exercises.forEach((exercise, exerciseIndex) => {
    const planned = Math.max(
      exercise.targetSetCount ?? PACE_DEFAULT_UNPLANNED_SETS,
      exercise.setCompletedAt.length,
    );
    for (let setIndex = 0; setIndex < planned; setIndex++) {
      if (setIndex === 0) {
        clock +=
          (previousRest ?? 0) +
          (exerciseIndex === 0 ? PACE_WORKOUT_SETUP_SECONDS : PACE_EXERCISE_TRANSITION_SECONDS);
      } else {
        clock += exercise.restSeconds;
      }
      clock += PACE_WORK_SECONDS_PER_SET;
      due.push(clock);
    }
    if (planned > 0) previousRest = exercise.restSeconds;
  });

  const plannedTotalSeconds = due[due.length - 1] ?? 0;
  const setsPlanned = due.length;
  const elapsedSeconds = Math.max(0, secondsBetween(startedAt, now));

  const completed = exercises
    .flatMap((exercise) => exercise.setCompletedAt.map((at) => secondsBetween(startedAt, at)))
    .map((seconds) => Math.max(0, Math.min(seconds, elapsedSeconds)))
    .sort((a, b) => a - b);
  const setsDone = completed.length;

  const lastAt = completed[setsDone - 1] ?? 0;
  const driftAtLastSet = setsDone > 0 ? lastAt - (due[setsDone - 1] ?? 0) : 0;
  const nextDue = due[setsDone];
  const allowedGap =
    nextDue == null ? null : nextDue - (setsDone > 0 ? (due[setsDone - 1] ?? 0) : 0);
  const overrun = allowedGap == null ? 0 : Math.max(0, elapsedSeconds - lastAt - allowedGap);
  const deltaSeconds = driftAtLastSet + overrun;

  const toleranceSeconds = Math.max(90, plannedTotalSeconds * 0.1);
  let status: PaceStatus;
  if (setsPlanned > 0 && setsDone >= setsPlanned) status = "done";
  else if (deltaSeconds > toleranceSeconds) status = "behind";
  else if (deltaSeconds < -toleranceSeconds) status = "ahead";
  else status = "on-pace";

  const projectedTotalSeconds =
    status === "done" ? lastAt : Math.max(elapsedSeconds, plannedTotalSeconds + deltaSeconds);

  return {
    status,
    deltaSeconds,
    toleranceSeconds,
    elapsedSeconds,
    plannedTotalSeconds,
    projectedTotalSeconds,
    setsDone,
    setsPlanned,
    overdue: overrun > 0,
    plan: [{ seconds: 0, sets: 0 }, ...due.map((seconds, index) => ({ seconds, sets: index + 1 }))],
    actual: [
      { seconds: 0, sets: 0 },
      ...completed.map((seconds, index) => ({ seconds, sets: index + 1 })),
    ],
  };
}
