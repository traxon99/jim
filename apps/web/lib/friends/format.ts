import { REACTION_EMOJI, REACTION_KINDS, type ReactionKind } from "@jim/core";
import type {
  CommentSummary,
  FeedComment,
  FriendWorkout,
  FriendWorkoutExercise,
  WorkoutReaction,
} from "./types";

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

/** The signed-in user's reaction kind, if any. */
export function myReaction(reactions: WorkoutReaction[]): ReactionKind | null {
  return reactions.find((r) => r.mine)?.kind ?? null;
}

export function reactionTotal(reactions: WorkoutReaction[]): number {
  return reactions.reduce((sum, reaction) => sum + reaction.count, 0);
}

/**
 * Optimistic picker tap before the server answers (issue #748): same kind
 * removes, another replaces the user's single reaction.
 */
export function pickReaction(reactions: WorkoutReaction[], kind: ReactionKind): WorkoutReaction[] {
  const mine = myReaction(reactions);
  if (mine === kind) {
    return withReaction(reactions, kind, false);
  }
  const cleared = reactions.reduce(
    (acc, reaction) => (reaction.mine ? withReaction(acc, reaction.kind, false) : acc),
    reactions,
  );
  return withReaction(cleared, kind, true);
}

/** Reconcile with `{ reacted }` from the API after `pickReaction`. */
export function settleReaction(
  before: WorkoutReaction[],
  kind: ReactionKind,
  reacted: boolean,
): WorkoutReaction[] {
  const cleared = before.reduce(
    (acc, reaction) => (reaction.mine ? withReaction(acc, reaction.kind, false) : acc),
    before,
  );
  return reacted ? withReaction(cleared, kind, true) : cleared;
}

/**
 * "💪🔥👏 You, theo and 10 others" for under the action row (issue #748).
 * `reactedBy` is up to two other usernames, newest first, from the server.
 */
export function reactionSummary(
  reactions: WorkoutReaction[],
  reactedBy: readonly string[],
): string | null {
  const total = reactionTotal(reactions);
  if (total === 0) return null;

  const emoji = [...reactions]
    .sort(
      (a, b) =>
        b.count - a.count || REACTION_KINDS.indexOf(a.kind) - REACTION_KINDS.indexOf(b.kind),
    )
    .slice(0, 3)
    .map((reaction) => REACTION_EMOJI[reaction.kind])
    .join("");

  const mine = myReaction(reactions) !== null;
  const names: string[] = [];
  if (mine) names.push("You");
  names.push(...reactedBy.slice(0, mine ? 1 : 2));

  const others = total - names.length;
  const nameText = joinNames(names);
  const suffix = others > 0 ? ` and ${others} ${others === 1 ? "other" : "others"}` : "";
  return `${emoji} ${nameText}${suffix}`;
}

function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * `reactions` after the signed-in user adds (`reacted`) or takes back their
 * `kind` reaction — used for comment reactions and legacy paths.
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

/** A loaded thread (oldest first) as the feed's count and newest comment (issue #749). */
export function summarizeComments(comments: readonly FeedComment[]): CommentSummary {
  const latest = comments.at(-1);
  return {
    count: comments.length,
    latest: latest ? { username: latest.username, body: latest.body } : null,
  };
}
