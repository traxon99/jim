"use client";

import {
  type ExerciseRow,
  type SessionExerciseRow,
  type SessionRow,
  type SetRow,
  db,
} from "@/lib/db/schema";
import {
  type InsightExercise,
  type InsightWorkout,
  LIFT_TREND_LENGTH,
  type PostWorkoutInsights,
  deletedSessionExerciseIds,
  exerciseCategoryOf,
  isStrengthExercise,
  postWorkoutInsights,
  resolveCurrentRows,
  startOfWeek,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns Dexie rows into the workouts `postWorkoutInsights` reads: current
 * sets only, in log order, with a warm-up exercise's sets marked as warm-ups
 * so they count toward nothing (issue #59).
 */
export function buildInsightWorkouts(
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  exercises: readonly Pick<ExerciseRow, "id" | "category">[],
  sets: readonly SetRow[],
): InsightWorkout[] {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  const sessionExerciseById = new Map(sessionExercises.map((se) => [se.id, se]));
  const setsBySession = new Map<string, InsightWorkout["sets"][number][]>();
  const current = resolveCurrentRows(sets)
    .filter((set) => !set.deletedAt)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  for (const set of current) {
    const se = sessionExerciseById.get(set.sessionExerciseId);
    if (!se || deleted.has(se.id)) continue;
    const exercise = exerciseById.get(se.exerciseId);
    const warmupExercise = exercise != null && exerciseCategoryOf(exercise) === "warmup";
    const list = setsBySession.get(se.sessionId) ?? [];
    list.push({
      exerciseId: se.exerciseId,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      rpe: set.rpe == null ? null : Number(set.rpe),
      kind: warmupExercise ? "warmup" : set.kind,
      restSeconds: set.restSeconds,
      durationSeconds: set.durationSeconds,
      completedAt: set.completedAt,
    });
    setsBySession.set(se.sessionId, list);
  }
  return sessions
    .filter((session) => !session.deletedAt && session.endedAt)
    .map((session) => ({
      id: session.id,
      routineId: session.routineId,
      startedAt: session.startedAt,
      endedAt: session.endedAt as Date,
      sets: setsBySession.get(session.id) ?? [],
    }));
}

/**
 * The finished workout's Insights (issue #870), live from Dexie. Reads only
 * the sets it needs: this week and last week, the routine's previous
 * workout, and the last few workouts of each lift for its e1RM trend.
 */
export function usePostWorkoutInsights(
  session: SessionRow,
  weekStart: number,
): { insights: PostWorkoutInsights; exercises: Map<string, ExerciseRow> } | null | undefined {
  return useLiveQuery(async () => {
    if (!session.endedAt) return null;
    const [allSessions, allSessionExercises, exercises] = await Promise.all([
      db.sessions.toArray(),
      db.sessionExercises.toArray(),
      db.exercises.toArray(),
    ]);
    const live = allSessions.filter(
      (s) => !s.deletedAt && s.endedAt && s.startedAt <= (session.startedAt as Date),
    );
    const sessionById = new Map(live.map((s) => [s.id, s]));
    const lastWeekStart = new Date(
      startOfWeek(session.startedAt, weekStart).getTime() - 7 * DAY_MS - DAY_MS,
    );

    const wanted = new Set<string>([session.id]);
    for (const s of live) if (s.startedAt >= lastWeekStart) wanted.add(s.id);
    const byNewest = [...live].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const previous = byNewest.find(
      (s) => s.id !== session.id && s.routineId && s.routineId === session.routineId,
    );
    if (previous) wanted.add(previous.id);

    const exerciseIds = new Set(
      allSessionExercises
        .filter((se) => se.sessionId === session.id && !se.deletedAt)
        .map((se) => se.exerciseId),
    );
    for (const exerciseId of exerciseIds) {
      const sessionIds = new Set(
        allSessionExercises
          .filter(
            (se) => se.exerciseId === exerciseId && !se.deletedAt && sessionById.has(se.sessionId),
          )
          .map((se) => se.sessionId),
      );
      let taken = 0;
      for (const s of byNewest) {
        if (taken >= LIFT_TREND_LENGTH * 2) break;
        if (sessionIds.has(s.id)) {
          wanted.add(s.id);
          taken++;
        }
      }
    }

    const sessions = [...wanted].flatMap((id) => {
      const s = sessionById.get(id) ?? (id === session.id ? session : undefined);
      return s ? [s] : [];
    });
    const sessionExercises = allSessionExercises.filter((se) => wanted.has(se.sessionId));
    const sets = await db.sets
      .where("sessionExerciseId")
      .anyOf(sessionExercises.map((se) => se.id))
      .toArray();

    const workouts = buildInsightWorkouts(sessions, sessionExercises, exercises, sets);
    const current = workouts.find((w) => w.id === session.id);
    if (!current) return null;
    const exerciseInfo = new Map<string, InsightExercise>(
      exercises.map((exercise) => [
        exercise.id,
        {
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
          isStrength: isStrengthExercise(exercise),
        },
      ]),
    );
    return {
      insights: postWorkoutInsights({
        current,
        history: workouts,
        exercises: exerciseInfo,
        weekStart,
      }),
      exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])),
    };
  }, [session.id, session.startedAt, session.endedAt, session.routineId, weekStart]);
}
