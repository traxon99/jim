import { startOfWeek } from "../history/week-grouping";
import { estimateOneRepMax } from "../one-rep-max";

/**
 * The post-workout Insights tab (issue #870): a finished workout against the
 * last time its routine was done, each lift's e1RM trend, this week against
 * last week, and a few facts about the session. Pure, so the phone computes
 * it from Dexie the moment the workout ends.
 */

export interface InsightWorkoutSet {
  exerciseId: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  /** "warmup" sets count toward nothing here, like the summary's volume (issue #494). */
  kind: string;
  restSeconds: number | null;
  durationSeconds?: number | null;
  completedAt: Date;
}

export interface InsightWorkout {
  id: string;
  routineId: string | null;
  startedAt: Date;
  endedAt: Date;
  /** Current, non-deleted sets in the order they were logged. */
  sets: readonly InsightWorkoutSet[];
}

export interface InsightExercise {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  /** Warm-ups and cardio count toward no muscle's sets. */
  isStrength: boolean;
}

export interface WorkoutTotals {
  volume: number;
  durationSeconds: number;
  reps: number;
  setCount: number;
  averageRestSeconds: number | null;
  /** Volume per minute of workout; null under a minute. */
  volumePerMinute: number | null;
  averageRpe: number | null;
}

export interface LiftTrend {
  exerciseId: string;
  /** Best e1RM of the lift in this workout. */
  oneRepMax: number;
  /** Best e1RM the last time the lift was done, or null the first time. */
  previous: number | null;
  /** Best e1RM per workout, oldest first, ending with this one. */
  series: number[];
}

export interface WeekDayVolume {
  thisWeek: number;
  lastWeek: number;
}

export type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "legs" | "core";

export const MUSCLE_GROUP_LABELS: Readonly<Record<MuscleGroup, string>> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  legs: "Legs",
  core: "Core",
};

const MUSCLE_GROUP_OF: Readonly<Record<string, MuscleGroup>> = {
  chest: "chest",
  lats: "back",
  "middle back": "back",
  "lower back": "back",
  traps: "back",
  shoulders: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
  quadriceps: "legs",
  hamstrings: "legs",
  glutes: "legs",
  calves: "legs",
  adductors: "legs",
  abductors: "legs",
  abdominals: "core",
};

const MUSCLE_GROUP_ORDER: readonly MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "core",
];

export interface MuscleGroupSets {
  group: MuscleGroup;
  thisWeek: number;
  lastWeek: number;
}

export interface WeekComparison {
  /** Seven days from the user's week start; `todayIndex` is this workout's day. */
  days: WeekDayVolume[];
  todayIndex: number;
  workouts: number;
  durationSeconds: number;
  volume: number;
  /** Last week's volume through the same weekday, the fair comparison mid-week. */
  lastWeekToDate: number;
  /** Working sets per muscle group, a secondary muscle counting half. */
  muscles: MuscleGroupSets[];
}

export interface SessionFacts {
  heaviest: { exerciseId: string; weight: number; reps: number } | null;
  /** The hardest set by RPE; `setNumber` counts the lift's working sets from 1. */
  topRpe: { exerciseId: string; rpe: number; setNumber: number } | null;
  /** Each lift's share of the volume, biggest first. */
  split: { exerciseId: string; volume: number; share: number }[];
}

export interface PostWorkoutInsights {
  totals: WorkoutTotals;
  /** The last earlier workout of the same routine, or null. */
  previous: { startedAt: Date; totals: WorkoutTotals } | null;
  lifts: LiftTrend[];
  week: WeekComparison;
  facts: SessionFacts;
}

export const LIFT_TREND_LENGTH = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

function workingSets(workout: InsightWorkout): InsightWorkoutSet[] {
  return workout.sets.filter((set) => set.kind !== "warmup");
}

function setVolume(set: InsightWorkoutSet): number {
  return set.weight != null && set.reps != null && set.weight > 0 && set.reps > 0
    ? set.weight * set.reps
    : 0;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function workoutTotals(workout: InsightWorkout): WorkoutTotals {
  const sets = workingSets(workout);
  const volume = sets.reduce((sum, set) => sum + setVolume(set), 0);
  const durationSeconds = Math.max(
    0,
    Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 1000),
  );
  const rests = sets.flatMap((set) => (set.restSeconds == null ? [] : [set.restSeconds]));
  const rpes = sets.flatMap((set) => (set.rpe == null ? [] : [set.rpe]));
  const averageRest = average(rests);
  const averageRpe = average(rpes);
  return {
    volume,
    durationSeconds,
    reps: sets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    setCount: sets.length,
    averageRestSeconds: averageRest == null ? null : Math.round(averageRest),
    volumePerMinute: durationSeconds >= 60 ? volume / (durationSeconds / 60) : null,
    averageRpe: averageRpe == null ? null : Math.round(averageRpe * 10) / 10,
  };
}

function bestOneRepMax(workout: InsightWorkout, exerciseId: string): number {
  let best = 0;
  for (const set of workingSets(workout)) {
    if (set.exerciseId !== exerciseId || set.weight == null || set.reps == null) continue;
    best = Math.max(best, estimateOneRepMax(set.weight, set.reps));
  }
  return best;
}

/** Whole calendar days from `from` to `to` in the runtime's zone, DST-proof. */
function calendarDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

function muscleGroupSets(
  workouts: readonly InsightWorkout[],
  exercises: ReadonlyMap<string, InsightExercise>,
): Map<MuscleGroup, number> {
  const totals = new Map<MuscleGroup, number>();
  for (const workout of workouts) {
    for (const set of workingSets(workout)) {
      const hasWork = (set.reps ?? 0) > 0 || (set.durationSeconds ?? 0) > 0;
      const exercise = exercises.get(set.exerciseId);
      if (!hasWork || !exercise?.isStrength) continue;
      // A set counts once per group: lats plus middle back is one back set.
      const credit = new Map<MuscleGroup, number>();
      for (const muscle of exercise.secondaryMuscles) {
        const group = MUSCLE_GROUP_OF[muscle];
        if (group) credit.set(group, Math.max(credit.get(group) ?? 0, 0.5));
      }
      for (const muscle of exercise.primaryMuscles) {
        const group = MUSCLE_GROUP_OF[muscle];
        if (group) credit.set(group, 1);
      }
      for (const [group, value] of credit) totals.set(group, (totals.get(group) ?? 0) + value);
    }
  }
  return totals;
}

export function postWorkoutInsights(input: {
  current: InsightWorkout;
  /** Other finished workouts, any order; the current one is ignored if present. */
  history: readonly InsightWorkout[];
  exercises: ReadonlyMap<string, InsightExercise>;
  weekStart: number;
}): PostWorkoutInsights {
  const { current, exercises, weekStart } = input;
  const earlier = input.history
    .filter((workout) => workout.id !== current.id && workout.startedAt < current.startedAt)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const totals = workoutTotals(current);

  let previous: PostWorkoutInsights["previous"] = null;
  if (current.routineId) {
    const last = [...earlier].reverse().find((w) => w.routineId === current.routineId);
    if (last) previous = { startedAt: last.startedAt, totals: workoutTotals(last) };
  }

  const lifts: LiftTrend[] = [];
  for (const set of workingSets(current)) {
    if (lifts.some((lift) => lift.exerciseId === set.exerciseId)) continue;
    const oneRepMax = bestOneRepMax(current, set.exerciseId);
    if (oneRepMax <= 0) continue;
    const before: number[] = [];
    for (let i = earlier.length - 1; i >= 0 && before.length < LIFT_TREND_LENGTH - 1; i--) {
      const workout = earlier[i];
      if (!workout) continue;
      const value = bestOneRepMax(workout, set.exerciseId);
      if (value > 0) before.unshift(value);
    }
    lifts.push({
      exerciseId: set.exerciseId,
      oneRepMax,
      previous: before.at(-1) ?? null,
      series: [...before, oneRepMax],
    });
  }

  const thisWeekStart = startOfWeek(current.startedAt, weekStart);
  const lastWeekStart = new Date(
    thisWeekStart.getFullYear(),
    thisWeekStart.getMonth(),
    thisWeekStart.getDate() - 7,
  );
  const todayIndex = calendarDays(thisWeekStart, current.startedAt);
  const days: WeekDayVolume[] = Array.from({ length: 7 }, () => ({ thisWeek: 0, lastWeek: 0 }));
  const thisWeek: InsightWorkout[] = [];
  const lastWeek: InsightWorkout[] = [];
  for (const workout of [...earlier, current]) {
    const offset = calendarDays(lastWeekStart, workout.startedAt);
    if (offset < 0 || offset >= 14) continue;
    const volume = workoutTotals(workout).volume;
    const day = days[offset % 7];
    if (!day) continue;
    if (offset >= 7) {
      thisWeek.push(workout);
      day.thisWeek += volume;
    } else {
      lastWeek.push(workout);
      day.lastWeek += volume;
    }
  }
  const thisGroups = muscleGroupSets(thisWeek, exercises);
  const lastGroups = muscleGroupSets(lastWeek, exercises);
  const week: WeekComparison = {
    days,
    todayIndex,
    workouts: thisWeek.length,
    durationSeconds: thisWeek.reduce((sum, w) => sum + workoutTotals(w).durationSeconds, 0),
    volume: days.reduce((sum, day) => sum + day.thisWeek, 0),
    lastWeekToDate: days.slice(0, todayIndex + 1).reduce((sum, day) => sum + day.lastWeek, 0),
    muscles: MUSCLE_GROUP_ORDER.flatMap((group) => {
      const a = thisGroups.get(group) ?? 0;
      const b = lastGroups.get(group) ?? 0;
      return a > 0 || b > 0 ? [{ group, thisWeek: a, lastWeek: b }] : [];
    }),
  };

  let heaviest: SessionFacts["heaviest"] = null;
  let topRpe: SessionFacts["topRpe"] = null;
  const setNumbers = new Map<string, number>();
  const volumeByExercise = new Map<string, number>();
  for (const set of workingSets(current)) {
    const setNumber = (setNumbers.get(set.exerciseId) ?? 0) + 1;
    setNumbers.set(set.exerciseId, setNumber);
    if (set.weight != null && set.weight > 0 && set.reps != null && set.reps > 0) {
      if (
        !heaviest ||
        set.weight > heaviest.weight ||
        (set.weight === heaviest.weight && set.reps > heaviest.reps)
      ) {
        heaviest = { exerciseId: set.exerciseId, weight: set.weight, reps: set.reps };
      }
    }
    if (set.rpe != null && (!topRpe || set.rpe > topRpe.rpe)) {
      topRpe = { exerciseId: set.exerciseId, rpe: set.rpe, setNumber };
    }
    const volume = setVolume(set);
    if (volume > 0) {
      volumeByExercise.set(set.exerciseId, (volumeByExercise.get(set.exerciseId) ?? 0) + volume);
    }
  }
  const split = [...volumeByExercise]
    .map(([exerciseId, volume]) => ({
      exerciseId,
      volume,
      share: totals.volume > 0 ? volume / totals.volume : 0,
    }))
    .sort((a, b) => b.volume - a.volume);

  return { totals, previous, lifts, week, facts: { heaviest, topRpe, split } };
}

/** Relative change from `before` to `after`, or null when there's nothing to compare. */
export function relativeChange(after: number, before: number | null | undefined): number | null {
  if (before == null || before <= 0) return null;
  return (after - before) / before;
}
