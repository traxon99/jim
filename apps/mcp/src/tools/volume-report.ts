import {
  type TrainingGoal,
  WEEKLY_SET_TARGETS,
  groupByWeek,
  isStrengthExercise,
  resolveCurrentRows,
  weeklySetStatusByMuscle,
  weeklyVolumeByMuscle,
} from "@jim/core";
import { type DbOrTx, exercises, sessionExercises, sessions, sets, users } from "@jim/db";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser } from "../context.js";

export type VolumeGroupBy = "muscle" | "exercise" | "week";

export interface VolumeReportInput {
  groupBy: VolumeGroupBy;
  from: string;
  to: string;
  /** Which weekly set range to check muscles against (issue #395). */
  goal?: TrainingGoal;
}

export interface ResolvedSet {
  sessionId: string;
  completedAt: Date;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  exerciseId: string;
}

export async function resolvedSetsInRange(
  tx: DbOrTx,
  from: Date,
  to: Date,
): Promise<ResolvedSet[]> {
  // Only this range, and only live workouts (issue #200), filtered in SQL
  // rather than loading the whole history (issue #503). Every version of a
  // set carries the original's completedAt and session exercise, so a range
  // filter keeps whole supersede chains for resolveCurrentRows.
  const rows = await tx
    .select({
      set: sets,
      sessionId: sessionExercises.sessionId,
      exerciseId: sessionExercises.exerciseId,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        gte(sets.completedAt, from),
        lte(sets.completedAt, to),
      ),
    );
  const placeBySet = new Map(rows.map((row) => [row.set.id, row]));

  // Only working sets are volume: warm-up sets are left out (issue #395).
  const setRows = resolveCurrentRows(rows.map((row) => row.set)).filter(
    (set) => !set.deletedAt && set.kind !== "warmup",
  );

  const result: ResolvedSet[] = [];
  for (const set of setRows) {
    const place = placeBySet.get(set.id);
    if (!place) continue;
    result.push({
      sessionId: place.sessionId,
      completedAt: set.completedAt,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      durationSeconds: set.durationSeconds,
      exerciseId: place.exerciseId,
    });
  }

  // Warm-up and cardio exercises aren't training volume either, in every
  // grouping, matching weekly_summary (issue #516).
  const known = await exercisesById(tx, [...new Set(result.map((set) => set.exerciseId))]);
  return result.filter((set) => {
    const exercise = known.get(set.exerciseId);
    return exercise !== undefined && isStrengthExercise(exercise);
  });
}

export async function exercisesById(
  tx: DbOrTx,
  exerciseIds: readonly string[],
): Promise<Map<string, typeof exercises.$inferSelect>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function weekStartFor(tx: DbOrTx, userId: string): Promise<number> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId));
  return user?.weekStart ?? 0;
}

export async function volumeReport(context: UserContext, input: VolumeReportInput) {
  const from = new Date(input.from);
  const to = new Date(input.to);

  return withUser(context, async (tx) => {
    const resolved = await resolvedSetsInRange(tx, from, to);

    if (input.groupBy === "week") {
      const weekStart = await weekStartFor(tx, context.userId);
      const groups = groupByWeek(resolved, weekStart, (set) => set.completedAt);
      return groups.map((group) => ({
        weekStart: group.weekStart.toISOString(),
        totalVolume: group.items.reduce(
          (sum, set) => sum + (set.weight != null && set.reps != null ? set.weight * set.reps : 0),
          0,
        ),
      }));
    }

    if (input.groupBy === "exercise") {
      const totals = new Map<string, number>();
      for (const set of resolved) {
        if (set.weight == null || set.reps == null) continue;
        totals.set(set.exerciseId, (totals.get(set.exerciseId) ?? 0) + set.weight * set.reps);
      }
      const exerciseNames = await exercisesById(tx, [...totals.keys()]);

      return [...totals.entries()]
        .map(([exerciseId, totalVolume]) => ({
          exerciseId,
          exerciseName: exerciseNames.get(exerciseId)?.name ?? "Unknown exercise",
          totalVolume,
        }))
        .sort((a, b) => b.totalVolume - a.totalVolume);
    }

    // groupBy === "muscle"
    const weekStart = await weekStartFor(tx, context.userId);
    const exerciseRows = await exercisesById(tx, [
      ...new Set(resolved.map((set) => set.exerciseId)),
    ]);

    const muscleSets = resolved
      .map((set) => {
        const exercise = exerciseRows.get(set.exerciseId);
        if (!exercise) return null;
        return {
          completedAt: set.completedAt,
          weight: set.weight,
          reps: set.reps,
          durationSeconds: set.durationSeconds,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
        };
      })
      .filter((set): set is NonNullable<typeof set> => set !== null);

    const goal = input.goal ?? "hypertrophy";
    const groups = weeklyVolumeByMuscle(muscleSets, weekStart);
    return groups.map((group) => ({
      weekStart: group.weekStart.toISOString(),
      volumeByMuscle: group.volumeByMuscle,
      setsByMuscle: group.setsByMuscle,
      goal,
      targetSets: WEEKLY_SET_TARGETS[goal],
      setStatusByMuscle: weeklySetStatusByMuscle(group.setsByMuscle, goal),
    }));
  });
}
