import { type DistanceUnit, distanceUnitFor } from "../cardio/format";
import { type PrKind, isVisiblePr, repsAtWeightExerciseIds } from "../sessions/personal-records";
import { resolveCurrentRows } from "../sync/supersede";
import { exerciseCategoryOf } from "../warmups/category";

/**
 * What Strava's create-activity API accepts for a Jim workout (issue #836).
 * `start_date_local` is the lifter's wall-clock start, which Strava expects
 * written with a trailing Z.
 */
export interface StravaActivity {
  name: string;
  sport_type: StravaSportType;
  start_date_local: string;
  /** Seconds between the workout's start and end. */
  elapsed_time: number;
  description: string;
  /** Meters; only for a workout that is one cardio sport. */
  distance?: number;
}

export type StravaSportType =
  | "WeightTraining"
  | "Workout"
  | "Run"
  | "Walk"
  | "Ride"
  | "Rowing"
  | "Swim"
  | "Elliptical"
  | "StairStepper";

/** Room under Strava's description limit for the "…" that marks a cut. */
export const STRAVA_DESCRIPTION_MAX = 1800;

export interface StravaSessionInput {
  name: string | null;
  startedAt: Date;
  endedAt: Date;
}

export interface StravaExerciseInput {
  /** The session_exercises row's id: what sets point at. */
  sessionExerciseId: string;
  exerciseId: string;
  position: number;
  name: string;
  slug?: string | null;
  category?: "strength" | "warmup" | "cardio" | null;
  trackingType?: string | null;
}

export interface StravaSetInput {
  id: string;
  sessionExerciseId: string;
  kind: string;
  weight: number | string | null;
  reps: number | null;
  durationSeconds: number | null;
  distance: number | string | null;
  supersedesId: string | null;
  deletedAt?: Date | null;
}

export interface StravaPrInput {
  setId: string | null;
  kind: PrKind;
  exerciseId: string;
  deletedAt?: Date | null;
}

export interface StravaActivityInput {
  session: StravaSessionInput;
  exercises: readonly StravaExerciseInput[];
  sets: readonly StravaSetInput[];
  prs: readonly StravaPrInput[];
  units: "lb" | "kg";
  /** The lifter's IANA zone, for the activity's local start time; UTC when unknown. */
  timeZone?: string | null;
}

const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;

/**
 * The Strava sport for a cardio exercise, from its name and slug (the seeded
 * cardio rows' slugs and everyday names). Anything Strava has no sport for
 * (boxing, SkiErg) is a generic Workout.
 */
export function stravaSportForCardio(exercise: {
  name: string;
  slug?: string | null;
}): StravaSportType {
  const text = `${exercise.slug ?? ""} ${exercise.name}`.toLowerCase();
  if (/\b(run|running|jog|jogging|treadmill)\b/.test(text)) return "Run";
  if (/\bwalk|walking\b/.test(text)) return "Walk";
  if (/\b(bike|biking|cycle|cycling|ride|riding)\b/.test(text)) return "Ride";
  if (/\b(row|rowing|rower)\b/.test(text)) return "Rowing";
  if (/\b(swim|swimming)\b/.test(text)) return "Swim";
  if (/\belliptical\b/.test(text)) return "Elliptical";
  if (/\b(stair|stairs|stepper)\b/.test(text)) return "StairStepper";
  return "Workout";
}

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "100.00" → "100", "62.5" → "62.5": synced numerics carry trailing zeros. */
function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The lifter's local wall-clock time as an ISO string ending in Z, which Strava's `start_date_local` expects. */
function localStart(date: Date, timeZone: string | null | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`;
  } catch {
    return `${date.toISOString().slice(0, 19)}Z`;
  }
}

function capDescription(lines: readonly string[]): string {
  const joined = lines.join("\n");
  if (joined.length <= STRAVA_DESCRIPTION_MAX) return joined;
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    // +1 for the newline and +1 for the closing "…".
    if (length + line.length + 2 > STRAVA_DESCRIPTION_MAX) break;
    kept.push(line);
    length += line.length + 1;
  }
  return `${kept.join("\n")}${kept.length > 0 ? "\n" : ""}…`;
}

/**
 * The Strava activity for a finished workout (issue #836). Strava's create
 * API has no per-set fields, so the sets go in the description: one line per
 * exercise with its working sets (weight×reps) and a 🏆 on any that set a PR,
 * then a PR line. Warm-up exercises and warm-up sets stay out. The sport is
 * WeightTraining unless every working exercise is cardio of one sport, in
 * which case it's that sport with the summed distance.
 */
export function stravaActivityFor(input: StravaActivityInput): StravaActivity {
  const { session, units } = input;
  const distanceUnit: DistanceUnit = distanceUnitFor(units);

  const currentSets = resolveCurrentRows(input.sets).filter(
    (set) => !set.deletedAt && set.kind !== "warmup",
  );
  const setsByExercise = new Map<string, StravaSetInput[]>();
  for (const set of currentSets) {
    const list = setsByExercise.get(set.sessionExerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.sessionExerciseId, list);
  }

  const working = [...input.exercises]
    .filter((exercise) => exerciseCategoryOf(exercise) !== "warmup")
    .sort((a, b) => a.position - b.position)
    .filter((exercise) => (setsByExercise.get(exercise.sessionExerciseId) ?? []).length > 0);

  const repsExerciseIds = repsAtWeightExerciseIds(
    input.exercises.map((exercise) => ({
      id: exercise.exerciseId,
      trackingType: exercise.trackingType,
    })),
  );
  const prSetIds = new Set<string>();
  const prKindsByExercise = new Map<string, Set<PrKind>>();
  const sessionSetIds = new Set(currentSets.map((set) => set.id));
  for (const pr of input.prs) {
    if (pr.deletedAt || !pr.setId || !sessionSetIds.has(pr.setId)) continue;
    if (!isVisiblePr(pr, repsExerciseIds)) continue;
    prSetIds.add(pr.setId);
    const kinds = prKindsByExercise.get(pr.exerciseId) ?? new Set<PrKind>();
    kinds.add(pr.kind);
    prKindsByExercise.set(pr.exerciseId, kinds);
  }

  const cardio = working.filter((exercise) => exerciseCategoryOf(exercise) === "cardio");
  const cardioSports = new Set(cardio.map((exercise) => stravaSportForCardio(exercise)));
  const allCardio = working.length > 0 && cardio.length === working.length;
  let sport: StravaSportType = "WeightTraining";
  if (allCardio) {
    sport = cardioSports.size === 1 ? ([...cardioSports][0] ?? "Workout") : "Workout";
  }

  let distanceMeters = 0;
  const lines: string[] = [];
  let setCount = 0;
  let volume = 0;
  for (const exercise of working) {
    const sets = setsByExercise.get(exercise.sessionExerciseId) ?? [];
    const isCardio = exerciseCategoryOf(exercise) === "cardio";
    const parts = sets.map((set) => {
      const weight = toNumber(set.weight);
      const distance = toNumber(set.distance);
      const mark = prSetIds.has(set.id) ? " 🏆" : "";
      if (isCardio || (distance != null && distance > 0)) {
        if (isCardio && distance != null && distance > 0) {
          distanceMeters += distance * (distanceUnit === "km" ? METERS_PER_KM : METERS_PER_MILE);
        }
        const bits: string[] = [];
        if (distance != null && distance > 0)
          bits.push(`${formatNumber(distance)} ${distanceUnit}`);
        if (set.durationSeconds != null && set.durationSeconds > 0) {
          bits.push(formatDuration(set.durationSeconds));
        }
        return `${bits.length > 0 ? bits.join(" · ") : "—"}${mark}`;
      }
      setCount++;
      if (weight != null && set.reps != null) {
        volume += weight * set.reps;
        return `${formatNumber(weight)}×${set.reps}${mark}`;
      }
      if (set.reps != null) return `${set.reps} reps${mark}`;
      if (set.durationSeconds != null && set.durationSeconds > 0) {
        return `${formatDuration(set.durationSeconds)}${mark}`;
      }
      return `—${mark}`;
    });
    lines.push(`${exercise.name}: ${parts.join(", ")}`);
  }

  const prNames = working
    .filter((exercise) => prKindsByExercise.has(exercise.exerciseId))
    .map((exercise) => exercise.name);
  if (prNames.length > 0) {
    lines.push(`🏆 ${prNames.length === 1 ? "PR" : "PRs"}: ${prNames.join(", ")}`);
  }
  if (!allCardio && setCount > 0 && volume > 0) {
    lines.unshift(`${setCount} sets · ${Math.round(volume).toLocaleString("en-US")} ${units}`);
  }

  const elapsed = Math.max(
    0,
    Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000),
  );
  const activity: StravaActivity = {
    name: session.name?.trim() || "Workout",
    sport_type: sport,
    start_date_local: localStart(session.startedAt, input.timeZone),
    elapsed_time: elapsed,
    description: capDescription(lines),
  };
  if (allCardio && cardioSports.size === 1 && distanceMeters > 0) {
    activity.distance = Math.round(distanceMeters);
  }
  return activity;
}
