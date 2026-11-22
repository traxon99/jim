import {
  PACE_EXERCISE_TRANSITION_SECONDS,
  PACE_WORKOUT_SETUP_SECONDS,
  PACE_WORK_SECONDS_PER_SET,
  type PaceCalibration,
} from "./pace";

/**
 * Pace from past performances (issue #853): the pace plan's fixed budgets
 * (setup before the first set, time per set beyond its rest, the switch to
 * each new exercise) are replaced by what this lifter actually took in their
 * last few workouts of the same routine.
 *
 * Each learned number is measured against the rest the timer was counting
 * down at the time (a set's `restTargetSeconds`), so changing an exercise's
 * rest still moves the plan by exactly that change. A routine changed a lot
 * since a past workout counts for less: setup and switch times come only
 * from past workouts that shared at least half their exercises with today's,
 * weighted by how much they shared. Per-exercise times belong to the
 * exercise, not the routine, so they count from every past workout that had
 * it. Every learned number is blended with the fixed default until there's
 * enough history behind it, so one odd workout can't swing the plan.
 */

export interface PaceHistorySet {
  completedAt: Date;
  /** The rest the timer was counting down before this set; null when unknown. */
  restTargetSeconds: number | null;
}

export interface PaceHistoryExercise {
  exerciseId: string;
  /** Superset sets alternate exercises, so their gaps aren't one exercise's pace. */
  inSuperset: boolean;
  /** This exercise's current, non-deleted sets in that workout. */
  sets: readonly PaceHistorySet[];
}

export interface PaceHistorySession {
  startedAt: Date;
  exercises: readonly PaceHistoryExercise[];
}

/** Past workouts considered, newest first; older ones say little about today. */
export const PACE_HISTORY_MAX_SESSIONS = 8;
/** A past workout sharing fewer of today's exercises than this has no say on setup or switches. */
export const PACE_HISTORY_MIN_SIMILARITY = 0.5;
/** Each older workout counts this much less than the one after it. */
const RECENCY_DECAY = 0.85;
/** A gap longer than this is a break (phone, chat), not a pace. */
const MAX_GAP_SECONDS = 20 * 60;
/** Learned times never drop below these, however quick the logging. */
const MIN_WORK_SECONDS = 15;
/** Sample weight at which a learned number fully replaces its default. */
const FULL_CONFIDENCE = { work: 4, setup: 3, transition: 3 } as const;

interface Sample {
  value: number;
  weight: number;
}

function weightedMedian(samples: readonly Sample[]): number | null {
  const usable = samples.filter((s) => s.weight > 0 && Number.isFinite(s.value));
  if (usable.length === 0) return null;
  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((sum, s) => sum + s.weight, 0) / 2;
  let running = 0;
  for (const sample of sorted) {
    running += sample.weight;
    if (running >= half) return sample.value;
  }
  return sorted[sorted.length - 1]?.value ?? null;
}

function blend(samples: readonly Sample[], fallback: number, fullWeight: number): number {
  const learned = weightedMedian(samples);
  if (learned === null) return fallback;
  const total = samples.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  const confidence = Math.min(1, total / fullWeight);
  return Math.round(confidence * learned + (1 - confidence) * fallback);
}

/** Share of exercises two workouts have in common (Jaccard), 0–1. */
export function exerciseOverlap(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const id of left) if (right.has(id)) shared++;
  return shared / (left.size + right.size - shared);
}

interface TimedSet {
  exerciseId: string;
  inSuperset: boolean;
  seconds: number;
  restTargetSeconds: number | null;
}

/**
 * Null when there's no usable history, so the caller keeps the fixed plan.
 * `currentExerciseIds` are today's main exercises, in any order.
 */
export function calibratePace(input: {
  currentExerciseIds: readonly string[];
  history: readonly PaceHistorySession[];
}): PaceCalibration | null {
  const sessions = [...input.history]
    .filter((session) => session.exercises.some((exercise) => exercise.sets.length > 0))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, PACE_HISTORY_MAX_SESSIONS);
  if (sessions.length === 0) return null;

  const timelines = sessions.map((session) =>
    session.exercises
      .flatMap((exercise) =>
        exercise.sets.map<TimedSet>((set) => ({
          exerciseId: exercise.exerciseId,
          inSuperset: exercise.inSuperset,
          seconds: (set.completedAt.getTime() - session.startedAt.getTime()) / 1000,
          restTargetSeconds: set.restTargetSeconds,
        })),
      )
      .filter((set) => set.seconds >= 0)
      .sort((a, b) => a.seconds - b.seconds),
  );

  // Time per set beyond the rest: consecutive sets of one exercise.
  const workSamplesByExercise = new Map<string, Sample[]>();
  const allWorkSamples: Sample[] = [];
  timelines.forEach((timeline, index) => {
    const recency = RECENCY_DECAY ** index;
    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1];
      const set = timeline[i];
      if (!prev || !set || prev.exerciseId !== set.exerciseId) continue;
      if (set.inSuperset || set.restTargetSeconds == null) continue;
      const gap = set.seconds - prev.seconds;
      if (gap > MAX_GAP_SECONDS) continue;
      const sample = {
        value: Math.max(MIN_WORK_SECONDS, gap - set.restTargetSeconds),
        weight: recency,
      };
      allWorkSamples.push(sample);
      const list = workSamplesByExercise.get(set.exerciseId) ?? [];
      list.push(sample);
      workSamplesByExercise.set(set.exerciseId, list);
    }
  });

  const workSecondsPerSet = blend(allWorkSamples, PACE_WORK_SECONDS_PER_SET, FULL_CONFIDENCE.work);
  const workSecondsByExerciseId = new Map<string, number>();
  for (const exerciseId of input.currentExerciseIds) {
    const samples = workSamplesByExercise.get(exerciseId);
    if (samples) {
      workSecondsByExerciseId.set(
        exerciseId,
        blend(samples, workSecondsPerSet, FULL_CONFIDENCE.work),
      );
    }
  }
  const workFor = (exerciseId: string) =>
    workSecondsByExerciseId.get(exerciseId) ?? workSecondsPerSet;

  // Setup and switches belong to the routine's shape, so a past workout
  // counts only as much as it looks like today's.
  const setupSamples: Sample[] = [];
  const transitionSamples: Sample[] = [];
  timelines.forEach((timeline, index) => {
    const session = sessions[index];
    if (!session) return;
    const pastIds = session.exercises.filter((e) => e.sets.length > 0).map((e) => e.exerciseId);
    const overlap = exerciseOverlap(pastIds, input.currentExerciseIds);
    if (overlap < PACE_HISTORY_MIN_SIMILARITY) return;
    const weight = overlap * RECENCY_DECAY ** index;

    const first = timeline[0];
    if (first && first.seconds <= MAX_GAP_SECONDS + PACE_WORKOUT_SETUP_SECONDS) {
      setupSamples.push({ value: Math.max(0, first.seconds - workFor(first.exerciseId)), weight });
    }
    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1];
      const set = timeline[i];
      if (!prev || !set || prev.exerciseId === set.exerciseId) continue;
      if (prev.inSuperset || set.inSuperset || set.restTargetSeconds == null) continue;
      const gap = set.seconds - prev.seconds;
      if (gap > MAX_GAP_SECONDS) continue;
      transitionSamples.push({
        value: Math.max(0, gap - set.restTargetSeconds - workFor(set.exerciseId)),
        weight,
      });
    }
  });

  return {
    setupSeconds: blend(setupSamples, PACE_WORKOUT_SETUP_SECONDS, FULL_CONFIDENCE.setup),
    transitionSeconds: blend(
      transitionSamples,
      PACE_EXERCISE_TRANSITION_SECONDS,
      FULL_CONFIDENCE.transition,
    ),
    workSecondsPerSet,
    workSecondsByExerciseId,
    sessionsUsed: sessions.length,
  };
}
