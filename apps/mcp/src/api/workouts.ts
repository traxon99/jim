import {
  type PrKind,
  type V1Workout,
  type V1Workouts,
  isVisiblePr,
  repsAtWeightExerciseIds,
} from "@jim/core";
import { exercises, users } from "@jim/db";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { type UserContext, withUser } from "../context.js";
import { getWorkout } from "../tools/get-workout.js";
import { listWorkouts } from "../tools/list-workouts.js";
import { notFound } from "./errors.js";

const instant = z.iso.datetime({ offset: true });

export const workoutsQuery = z.object({
  from: instant.optional(),
  to: instant.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const workoutWebPath = (id: string) => `/portal/workouts/${id}`;

async function unitsOf(context: UserContext): Promise<"lb" | "kg"> {
  const [user] = await withUser(context, (tx) =>
    tx.select({ units: users.units }).from(users).where(eq(users.id, context.userId)),
  );
  return user?.units ?? "lb";
}

/** `GET /v1/workouts` (#739): finished workouts, newest first, from `list_workouts`. */
export async function v1Workouts(
  context: UserContext,
  input: z.infer<typeof workoutsQuery>,
): Promise<V1Workouts> {
  // list_workouts limits before it drops the workout in progress, so ask for
  // one more for that and one more to tell whether there's another page.
  const rows = await listWorkouts(context, { ...input, limit: input.limit + 2 });
  return {
    units: await unitsOf(context),
    hasMore: rows.length > input.limit,
    workouts: rows.slice(0, input.limit).map((row) => ({
      id: row.id,
      name: row.name,
      routineName: row.routineName,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationMinutes: Math.round(row.durationSeconds / 60),
      exerciseCount: row.exerciseCount,
      workingSets: row.setCount,
      volume: Math.round(row.totalVolume * 100) / 100,
      prCount: row.prCount,
      gym: row.gym,
      webPath: workoutWebPath(row.id),
    })),
  };
}

/**
 * `GET /v1/workouts/:id` (#739): one workout's current sets, from
 * `get_workout`. An unknown id, someone else's (RLS hides it), a deleted
 * one or one still in progress is a 404.
 */
export async function v1Workout(context: UserContext, id: string): Promise<V1Workout> {
  if (!UUID_RE.test(id)) throw notFound(`No workout with id ${id}.`);
  let workout: Awaited<ReturnType<typeof getWorkout>>;
  try {
    workout = await getWorkout(context, id);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No workout found")) {
      throw notFound(`No workout with id ${id}.`);
    }
    throw error;
  }
  // The workout in progress is on /v1/status, display only (ADR-007).
  if (!workout.endedAt) throw notFound(`Workout ${id} hasn't finished yet.`);
  // Its list_workouts row, for the same counts the list shows.
  const startedAt = new Date(workout.startedAt).getTime();
  const nearby = await listWorkouts(context, {
    from: new Date(startedAt - 1000).toISOString(),
    to: new Date(startedAt + 1000).toISOString(),
    limit: 100,
  });
  const match = nearby.find((row) => row.id === id);
  const working = workout.exercises.flatMap((e) => e.sets).filter((s) => s.kind !== "warmup");
  // The PR kinds the app shows, the same rule as prCount (#389, #354).
  const exerciseIds = [...new Set(workout.exercises.map((e) => e.exerciseId))];
  const repsExerciseIds = repsAtWeightExerciseIds(
    exerciseIds.length
      ? await withUser(context, (tx) =>
          tx
            .select({ id: exercises.id, trackingType: exercises.trackingType })
            .from(exercises)
            .where(inArray(exercises.id, exerciseIds)),
        )
      : [],
  );
  return {
    id: workout.id,
    name: workout.name,
    routineName: match?.routineName ?? null,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationMinutes: Math.round((new Date(workout.endedAt).getTime() - startedAt) / 60_000),
    exerciseCount: workout.exercises.length,
    workingSets: match?.setCount ?? working.length,
    volume: Math.round((match?.totalVolume ?? 0) * 100) / 100,
    prCount: match?.prCount ?? 0,
    gym: workout.gym?.name ?? null,
    webPath: workoutWebPath(workout.id),
    notes: workout.notes,
    exercises: workout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.exerciseName,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        kind: set.kind,
        weight: set.weight,
        reps: set.reps,
        durationSeconds: set.durationSeconds,
        distance: set.distance,
        rpe: set.rpe,
        rir: set.rir,
        completedAt: set.completedAt,
        prs: set.prKinds.filter((kind) =>
          isVisiblePr({ kind: kind as PrKind, exerciseId: exercise.exerciseId }, repsExerciseIds),
        ),
      })),
    })),
  };
}
