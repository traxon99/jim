import type { ShareSnapshot, SharedRoutine, SharedRoutineItem } from "./snapshot";

// What a share link's preview says about it (issue #431): the line a chat app
// shows under the title when the link is pasted into Messages, Slack and the
// like, and the stats on its preview image. Estimates only, worked out from
// the routine's targets, since a link carries no history to time it by.

/** Assumed when a routine leaves a target blank. */
const DEFAULT_SETS = 3;
const DEFAULT_REST_SECONDS = 90;
const DEFAULT_HOLD_SECONDS = 30;
/** A rep, and the setup around a set (unracking, getting into position). */
const SECONDS_PER_REP = 3;
const SET_SETUP_SECONDS = 15;
const DEFAULT_REPS = 10;
/** Moving between exercises: loading the bar, finding the next machine. */
const EXERCISE_CHANGE_SECONDS = 60;

function setSeconds(item: SharedRoutineItem, timed: boolean): number {
  if (timed) return item.targetDurationSeconds ?? DEFAULT_HOLD_SECONDS;
  const low = item.targetRepsLow ?? item.targetRepsHigh;
  const high = item.targetRepsHigh ?? item.targetRepsLow;
  const reps = low == null || high == null ? DEFAULT_REPS : (low + high) / 2;
  return SET_SETUP_SECONDS + reps * SECONDS_PER_REP;
}

function routineSeconds(snapshot: ShareSnapshot, routine: SharedRoutine): number {
  let total = 0;
  routine.items.forEach((item, index) => {
    const exercise = snapshot.exercises[item.exercise];
    const timed =
      exercise?.trackingType === "time" ||
      (exercise?.trackingType === "distance_time" && item.targetDurationSeconds != null);
    const sets = item.targetSets ?? DEFAULT_SETS;
    // In a superset only its last exercise rests: the others go straight on.
    const next = routine.items[index + 1];
    const restsAfter =
      item.supersetGroup == null || next?.supersetGroup !== item.supersetGroup
        ? (item.targetRestSeconds ?? DEFAULT_REST_SECONDS)
        : 0;
    total += sets * setSeconds(item, timed) + Math.max(0, sets - 1) * restsAfter;
    total += EXERCISE_CHANGE_SECONDS;
  });
  return total;
}

/**
 * Roughly how long a routine takes, in minutes rounded to 5, counting its
 * warm-up (the linked warm-up routine, or its warm-up minutes). Null when
 * there's nothing in it to time.
 */
export function estimateRoutineMinutes(
  snapshot: ShareSnapshot,
  routineIndex: number,
): number | null {
  const routine = snapshot.routines[routineIndex];
  if (!routine) return null;
  let seconds = routineSeconds(snapshot, routine);
  const warmup = routine.warmupRoutine === null ? null : snapshot.routines[routine.warmupRoutine];
  if (warmup && warmup !== routine) seconds += routineSeconds(snapshot, warmup);
  else if (routine.warmupMinutes) seconds += routine.warmupMinutes * 60;
  if (seconds === 0) return null;
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

export interface RoutineShareSummary {
  kind: "routine";
  name: string;
  exercises: number;
  /** Working sets the routine sets targets for; 0 when none are set. */
  sets: number;
  minutes: number | null;
  /** The routine's exercises in order, for a "Bench Press, Squat…" line. */
  exerciseNames: string[];
}

export interface ProgramShareSummary {
  kind: "program";
  name: string;
  /** Distinct routines the program uses. */
  routines: number;
  /** Training days a week (weekly mode), or workouts in one pass of the sequence. */
  workouts: number;
  mode: "sequence" | "weekly";
  weeks: number | null;
  /** A typical session: the average estimate of its routines. */
  minutes: number | null;
  routineNames: string[];
}

export type ShareSummary = RoutineShareSummary | ProgramShareSummary;

/** The numbers a share link's preview shows. */
export function shareSnapshotSummary(snapshot: ShareSnapshot): ShareSummary {
  const program = snapshot.program;
  if (snapshot.kind === "program" && program) {
    const used = [
      ...new Set(
        program.entries.flatMap((entry) => (entry.routine === null ? [] : [entry.routine])),
      ),
    ];
    const estimates = used
      .map((index) => estimateRoutineMinutes(snapshot, index))
      .filter((minutes): minutes is number => minutes !== null);
    const average =
      estimates.length === 0 ? null : estimates.reduce((sum, m) => sum + m, 0) / estimates.length;
    return {
      kind: "program",
      name: program.name,
      routines: used.length,
      workouts: program.entries.filter((entry) => entry.routine !== null).length,
      mode: program.mode,
      weeks: program.durationWeeks,
      minutes: average === null ? null : Math.max(5, Math.round(average / 5) * 5),
      routineNames: used.flatMap((index) => snapshot.routines[index]?.name ?? []),
    };
  }

  const routine = snapshot.routines[0];
  return {
    kind: "routine",
    name: routine?.name ?? "Shared routine",
    exercises: routine?.items.length ?? 0,
    sets: routine?.items.reduce((sum, item) => sum + (item.targetSets ?? 0), 0) ?? 0,
    minutes: estimateRoutineMinutes(snapshot, 0),
    exerciseNames: (routine?.items ?? []).flatMap(
      (item) => snapshot.exercises[item.exercise]?.name ?? [],
    ),
  };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The summary's stats as short phrases, e.g. ["~55 min", "6 exercises", "18 sets"]. */
export function shareSummaryStats(summary: ShareSummary): string[] {
  const stats: string[] = [];
  if (summary.kind === "routine") {
    if (summary.minutes !== null) stats.push(`~${summary.minutes} min`);
    stats.push(plural(summary.exercises, "exercise"));
    if (summary.sets > 0) stats.push(plural(summary.sets, "set"));
    return stats;
  }
  if (summary.weeks !== null) stats.push(plural(summary.weeks, "week"));
  stats.push(
    summary.mode === "weekly" ? `${summary.workouts}× a week` : plural(summary.workouts, "workout"),
  );
  if (summary.minutes !== null) stats.push(`~${summary.minutes} min sessions`);
  return stats;
}

/** Up to `max` names, then "+N more". */
export function listNames(names: readonly string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}
