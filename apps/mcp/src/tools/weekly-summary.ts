import {
  type ExerciseCategory,
  type TrainingGoal,
  WEEKLY_SET_TARGETS,
  addWeeks,
  isStrengthExercise,
  startOfWeek,
  weeklySetStatusByMuscle,
  weeklyVolumeByMuscle,
} from "@jim/core";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";
import {
  type ResolvedSet,
  type WeekSettings,
  exercisesById,
  resolvedSetsInRange,
  weekSettingsFor,
} from "./volume-report.js";

export const MAX_SUMMARY_WEEKS = 12;

export interface WeeklySummaryInput {
  /** Any moment inside the (latest) week to summarize. Defaults to now. */
  date?: string;
  /** How many weeks to summarize, ending with `date`'s week. Defaults to 1. */
  weeks?: number;
  goal?: TrainingGoal;
}

export interface SummaryExercise {
  name: string;
  category?: ExerciseCategory | null;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
}

/** The `weeks` week starts ending with `date`'s week, newest first. */
export function weekStartsEndingAt(date: Date, weeks: number, week: WeekSettings): Date[] {
  const latest = startOfWeek(date, week.weekStart, week.timeZone);
  return Array.from({ length: weeks }, (_, i) =>
    addWeeks(latest, -i, week.weekStart, week.timeZone),
  );
}

/**
 * One summary per week in `weekStarts`, including weeks with no training, so
 * "what did I do this week" has an answer even on a rest week. Warm-up
 * exercises are left out entirely and callers pass working sets only
 * (issue #395).
 */
export function summarizeWeeks(
  sets: readonly ResolvedSet[],
  exercises: ReadonlyMap<string, SummaryExercise>,
  weekStarts: readonly Date[],
  week: WeekSettings,
  goal: TrainingGoal,
) {
  return weekStarts.map((start) => {
    const end = addWeeks(start, 1, week.weekStart, week.timeZone);
    const weekSets = sets.filter((set) => {
      const exercise = exercises.get(set.exerciseId);
      return (
        exercise &&
        isStrengthExercise(exercise) &&
        set.completedAt >= start &&
        set.completedAt < end
      );
    });

    const byExercise = new Map<string, { sets: number; volume: number }>();
    let totalVolume = 0;
    for (const set of weekSets) {
      const volume = set.weight != null && set.reps != null ? set.weight * set.reps : 0;
      totalVolume += volume;
      const entry = byExercise.get(set.exerciseId) ?? { sets: 0, volume: 0 };
      entry.sets += 1;
      entry.volume += volume;
      byExercise.set(set.exerciseId, entry);
    }

    const [muscles] = weeklyVolumeByMuscle(
      weekSets.map((set) => {
        const exercise = exercises.get(set.exerciseId) as SummaryExercise;
        return {
          completedAt: set.completedAt,
          weight: set.weight,
          reps: set.reps,
          durationSeconds: set.durationSeconds,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
        };
      }),
      week.weekStart,
      week.timeZone,
    );
    const setsByMuscle = muscles?.setsByMuscle ?? {};

    return {
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      workouts: new Set(weekSets.map((set) => set.sessionId)).size,
      workingSets: weekSets.length,
      totalVolume,
      setsByMuscle,
      volumeByMuscle: muscles?.volumeByMuscle ?? {},
      goal,
      targetSets: WEEKLY_SET_TARGETS[goal],
      setStatusByMuscle: weeklySetStatusByMuscle(setsByMuscle, goal),
      exercises: [...byExercise.entries()]
        .map(([exerciseId, totals]) => ({
          exerciseId,
          exerciseName: exercises.get(exerciseId)?.name ?? "Unknown exercise",
          ...totals,
        }))
        .sort((a, b) => b.sets - a.sets || b.volume - a.volume),
    };
  });
}

export async function weeklySummary(context: UserContext, input: WeeklySummaryInput) {
  const date = input.date ? new Date(input.date) : new Date();
  const weeks = Math.min(Math.max(input.weeks ?? 1, 1), MAX_SUMMARY_WEEKS);
  const goal = input.goal ?? "hypertrophy";

  return withUser(context, async (tx) => {
    const week = await weekSettingsFor(tx, context.userId);
    const weekStarts = weekStartsEndingAt(date, weeks, week);
    const from = weekStarts[weekStarts.length - 1] as Date;
    const to = addWeeks(weekStarts[0] as Date, 1, week.weekStart, week.timeZone);

    const sets = await resolvedSetsInRange(tx, from, to);
    const exercises = await exercisesById(tx, [...new Set(sets.map((set) => set.exerciseId))]);
    return summarizeWeeks(sets, exercises, weekStarts, week, goal);
  });
}
