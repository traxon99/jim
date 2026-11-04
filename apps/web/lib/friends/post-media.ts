import type { PrKind, RoutineIconColor } from "@jim/core";
import type { FriendWorkout, FriendWorkoutRecord } from "./types";

// What a full-width feed post (issue #747) shows in its media area.

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

/** "now", "5m", "2h", "3d", then a short date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A workout's second header line: "Push Day · 2h · Iron Works". */
export function workoutHeaderLine(workout: FriendWorkout, now: Date = new Date()): string {
  return [workout.name ?? "Workout", timeAgo(workout.endedAt, now), workout.gymName]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/** "12,450" — whole units, grouped. */
export function formatVolume(volume: number): string {
  return Math.round(volume).toLocaleString();
}

/** How full a muscle's bar is next to the busiest one, 0–100. */
export function muscleBarPercent(sets: number, most: number): number {
  if (most <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((sets / most) * 100)));
}

const RECORD_KIND_LINES: Partial<Record<PrKind, string>> = {
  "1rm": "e1RM",
  reps_at_weight: "rep PR",
};

/** "Bench Press · 225 lb × 5" and "New e1RM · 262 lb" for a PR row on the summary slide. */
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
 * split into its label and the amount the slide shows large. A detail without
 * the separator is all label.
 */
export function splitRecordDetail(detail: string | null): { label: string; amount: string | null } {
  if (!detail) return { label: "", amount: null };
  const at = detail.lastIndexOf(" · ");
  if (at < 0) return { label: detail, amount: null };
  return { label: detail.slice(0, at), amount: detail.slice(at + 3) };
}
