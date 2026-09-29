import { REACTION_KINDS, type ReactionKind } from "@jim/core";
import type { FriendWorkout, FriendWorkoutExercise, WorkoutReaction } from "./types";

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

/** Every reaction kind in button order, with its count (0 when no one used it). */
export function reactionButtons(reactions: WorkoutReaction[]): WorkoutReaction[] {
  return REACTION_KINDS.map(
    (kind) => reactions.find((r) => r.kind === kind) ?? { kind, count: 0, mine: false },
  );
}

/**
 * `reactions` after the signed-in user adds (`reacted`) or takes back their
 * `kind` reaction — for showing a tap before the server answers.
 */
export function withReaction(
  reactions: WorkoutReaction[],
  kind: ReactionKind,
  reacted: boolean,
): WorkoutReaction[] {
  const current = reactions.find((r) => r.kind === kind);
  if ((current?.mine ?? false) === reacted) return reactions;
  const count = (current?.count ?? 0) + (reacted ? 1 : -1);
  const others = reactions.filter((r) => r.kind !== kind);
  const next = count > 0 ? [...others, { kind, count, mine: reacted }] : others;
  return next.sort((a, b) => REACTION_KINDS.indexOf(a.kind) - REACTION_KINDS.indexOf(b.kind));
}
