import type { PrKind, RoutineIconColor } from "@jim/core";
import type { FriendWorkout, FriendWorkoutExercise, FriendWorkoutRecord } from "./types";

// What a feed post (issue #747, simplified in #770) and a profile's post tiles show.

/**
 * The media area's background: a gradient in the routine's icon color, with
 * a deeper dark-mode pair so white text keeps its contrast. Full literal class
 * names so Tailwind's scanner picks them up.
 */
const TINTS: Record<RoutineIconColor, string> = {
  red: "from-red-400 to-red-700 dark:from-red-700 dark:to-red-950",
  orange: "from-orange-400 to-orange-700 dark:from-orange-600 dark:to-orange-950",
  amber: "from-amber-400 to-amber-700 dark:from-amber-600 dark:to-amber-950",
  green: "from-green-500 to-green-800 dark:from-green-700 dark:to-green-950",
  teal: "from-teal-500 to-teal-800 dark:from-teal-700 dark:to-teal-950",
  blue: "from-blue-500 to-blue-800 dark:from-blue-700 dark:to-blue-950",
  indigo: "from-indigo-500 to-indigo-800 dark:from-indigo-700 dark:to-indigo-950",
  pink: "from-pink-400 to-pink-700 dark:from-pink-700 dark:to-pink-950",
};

/** A workout with no routine color: neutral zinc. */
const NEUTRAL_TINT = "from-zinc-600 to-zinc-900 dark:from-zinc-700 dark:to-zinc-950";
/** Record and achievement posts: purple, like a trophy case. */
export const RECORD_TINT = "from-purple-400 to-purple-700 dark:from-purple-700 dark:to-purple-950";

export function postTint(color: RoutineIconColor | null): string {
  return `bg-linear-to-br ${color ? TINTS[color] : NEUTRAL_TINT}`;
}

/** "now", "5m ago", "2h ago", "3d ago", then a short date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A workout post's second header line: "2h ago · Iron Works". The title names the workout. */
export function workoutHeaderLine(workout: FriendWorkout, now: Date = new Date()): string {
  return [timeAgo(workout.endedAt, now), workout.gymName]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/** The dot beside a workout post's title, in its routine's icon color. */
const DOTS: Record<RoutineIconColor, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  pink: "bg-pink-500",
};

export function routineDot(color: RoutineIconColor | null): string {
  return color ? DOTS[color] : "bg-zinc-400 dark:bg-zinc-500";
}

/** Working sets across the workout's exercises. */
export function workoutSets(workout: Pick<FriendWorkout, "exercises">): number {
  return workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
}

/** One row of a post's exercise list: "4 × 225 lb", "3 × 12 reps" or "2 sets". */
export function exerciseLine(
  exercise: FriendWorkoutExercise,
  units: FriendWorkout["units"],
): string {
  if (exercise.topWeight !== null && exercise.topWeight > 0) {
    return `${exercise.sets} × ${exercise.topWeight} ${units}`;
  }
  if (exercise.topReps !== null) return `${exercise.sets} × ${exercise.topReps} reps`;
  return `${exercise.sets} ${exercise.sets === 1 ? "set" : "sets"}`;
}

/** A workout's PRs by exercise name, so the exercise list can mark the lifts that set one. */
export function recordsByExercise(
  records: readonly FriendWorkoutRecord[],
): Map<string, FriendWorkoutRecord[]> {
  const byExercise = new Map<string, FriendWorkoutRecord[]>();
  for (const record of records) {
    byExercise.set(record.exercise, [...(byExercise.get(record.exercise) ?? []), record]);
  }
  return byExercise;
}

/** "12,450" — whole units, grouped. */
export function formatVolume(volume: number): string {
  return Math.round(volume).toLocaleString();
}

const RECORD_KIND_LINES: Partial<Record<PrKind, string>> = {
  "1rm": "e1RM",
  reps_at_weight: "rep PR",
};

/** "Bench Press · 225 lb × 5" and "New e1RM · 262 lb": what a PR mark on a post says. */
export function recordLines(
  record: FriendWorkoutRecord,
  units: FriendWorkout["units"],
): { title: string; detail: string } {
  const set =
    record.weight !== null && record.weight > 0
      ? `${record.weight} ${units}${record.reps !== null ? ` × ${record.reps}` : ""}`
      : record.reps !== null
        ? `${record.reps} reps`
        : null;
  const value =
    record.kind === "reps_at_weight"
      ? `${record.value} reps`
      : `${Math.round(record.value)} ${units}`;
  return {
    title: set ? `${record.exercise} · ${set}` : record.exercise,
    detail: `New ${RECORD_KIND_LINES[record.kind] ?? "PR"} · ${value}`,
  };
}

/**
 * A record post's detail ("Estimated 1RM · 225 lb", from recordPostDraft)
 * split into its label and the amount the post shows in bold. A detail without
 * the separator is all label.
 */
export function splitRecordDetail(detail: string | null): { label: string; amount: string | null } {
  if (!detail) return { label: "", amount: null };
  const at = detail.lastIndexOf(" · ");
  if (at < 0) return { label: detail, amount: null };
  return { label: detail.slice(0, at), amount: detail.slice(at + 3) };
}
