import type { FriendWorkout, FriendWorkoutExercise } from "./types";

/** "185 lb × 5", "12 reps" or "3 sets" — the most useful thing to show per exercise. */
export function describeExercise(exercise: FriendWorkoutExercise, units: FriendWorkout["units"]) {
  const sets = `${exercise.sets} ${exercise.sets === 1 ? "set" : "sets"}`;
  if (exercise.topWeight !== null && exercise.topWeight > 0) {
    const top =
      exercise.topReps !== null
        ? `${exercise.topWeight} ${units} × ${exercise.topReps}`
        : `${exercise.topWeight} ${units}`;
    return `${sets} · top ${top}`;
  }
  if (exercise.topReps !== null) return `${sets} · best ${exercise.topReps} reps`;
  return sets;
}

/** Whole minutes between start and end, never negative. */
export function workoutMinutes(workout: Pick<FriendWorkout, "startedAt" | "endedAt">): number {
  const ms = Date.parse(workout.endedAt) - Date.parse(workout.startedAt);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : 0;
}
