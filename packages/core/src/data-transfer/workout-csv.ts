import { normalize } from "../fuzzy-text";
import { parseCsv, toCsv } from "./csv";

/**
 * Workout history in and out of other trackers' CSV exports (issues #241,
 * #242). Parsing turns a Strong or Hevy file into plain workouts; writing
 * produces Strong's column layout, which Strong, Hevy and most other apps
 * import, and which `parseWorkoutCsv` reads back.
 */

export type WeightUnit = "kg" | "lb";
export type ImportSetKind = "warmup" | "working" | "drop" | "failure";

export interface ImportedSet {
  kind: ImportSetKind;
  weight: number | null;
  /** The unit `weight` is in, when the file says so; null means ask the user. */
  weightUnit: WeightUnit | null;
  reps: number | null;
  durationSeconds: number | null;
  distance: number | null;
  rpe: number | null;
}

export interface ImportedExercise {
  name: string;
  notes: string | null;
  /** Exercises in one workout sharing a key were a superset. */
  supersetKey: string | null;
  sets: ImportedSet[];
}

export interface ImportedWorkout {
  name: string | null;
  startedAt: Date;
  endedAt: Date | null;
  notes: string | null;
  exercises: ImportedExercise[];
}

export type WorkoutCsvFormat = "strong" | "hevy";

export interface ParsedWorkoutCsv {
  format: WorkoutCsvFormat;
  workouts: ImportedWorkout[];
}

export class WorkoutCsvError extends Error {}

function columnIndex(header: readonly string[]): (...names: string[]) => number {
  const normalized = header.map((cell) => cell.trim().toLowerCase());
  return (...names) => {
    for (const name of names) {
      const index = normalized.indexOf(name);
      if (index !== -1) return index;
    }
    return -1;
  };
}

function cell(row: readonly string[], index: number): string {
  return index === -1 ? "" : (row[index] ?? "").trim();
}

/** "62,5" (a semicolon-separated file's decimal comma) reads the same as "62.5". */
function parseNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.includes(".") ? value : value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Strong and Hevy both write 0 for "not tracked", so 0 reads as empty. */
function positive(value: string): number | null {
  const parsed = parseNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function parseUnit(value: string): WeightUnit | null {
  const unit = value.toLowerCase();
  if (unit === "kg" || unit === "kgs") return "kg";
  if (unit === "lb" || unit === "lbs") return "lb";
  return null;
}

/** Strong's "2024-01-15 07:05:12" (local time, seconds optional). */
function parseStrongDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Hevy's "15 Jan 2024, 07:05" (local time); ISO-ish values fall back to the Strong parser. */
function parseHevyDate(value: string): Date | null {
  const match = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(
    value,
  );
  if (!match) return parseStrongDate(value);
  const [, d, mon, y, h, mi, s] = match;
  const month = MONTHS.indexOf((mon ?? "").toLowerCase());
  if (month === -1) return null;
  return new Date(Number(y), month, Number(d), Number(h), Number(mi), Number(s ?? 0));
}

/** "1h 5m", "45m", "30s" or a bare number of seconds. */
export function parseDurationSeconds(value: string): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const hours = /(\d+)\s*h/.exec(value);
  const minutes = /(\d+)\s*m(?!s)/.exec(value);
  const seconds = /(\d+)\s*s/.exec(value);
  if (!hours && !minutes && !seconds) return null;
  return (
    Number(hours?.[1] ?? 0) * 3600 + Number(minutes?.[1] ?? 0) * 60 + Number(seconds?.[1] ?? 0)
  );
}

export function formatStrongDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function strongSetKind(setOrder: string): ImportSetKind | null {
  const value = setOrder.toUpperCase();
  if (/^\d+$/.test(value)) return "working";
  if (value === "W") return "warmup";
  if (value === "D") return "drop";
  if (value === "F") return "failure";
  // "Rest Timer", "Note" and anything else aren't sets.
  return null;
}

function hevySetKind(setType: string): ImportSetKind {
  const value = setType.toLowerCase();
  if (value === "warmup") return "warmup";
  if (value === "failure") return "failure";
  if (value === "dropset" || value === "drop") return "drop";
  return "working";
}

function hasData(set: ImportedSet): boolean {
  return (
    set.weight != null || set.reps != null || set.durationSeconds != null || set.distance != null
  );
}

/** Groups rows into workouts (by a per-workout key) and exercises (by name), keeping file order. */
class WorkoutBuilder {
  private readonly workouts = new Map<string, ImportedWorkout>();

  workout(key: string, create: () => ImportedWorkout): ImportedWorkout {
    let workout = this.workouts.get(key);
    if (!workout) {
      workout = create();
      this.workouts.set(key, workout);
    }
    return workout;
  }

  exercise(
    workout: ImportedWorkout,
    name: string,
    notes: string | null,
    supersetKey: string | null,
  ): ImportedExercise {
    let exercise = workout.exercises.find((candidate) => candidate.name === name);
    if (!exercise) {
      exercise = { name, notes, supersetKey, sets: [] };
      workout.exercises.push(exercise);
    }
    if (!exercise.notes && notes) exercise.notes = notes;
    return exercise;
  }

  result(): ImportedWorkout[] {
    return [...this.workouts.values()]
      .map((workout) => ({
        ...workout,
        exercises: workout.exercises.filter((exercise) => exercise.sets.length > 0),
      }))
      .filter((workout) => workout.exercises.length > 0)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }
}

function parseStrong(header: readonly string[], rows: readonly string[][]): ImportedWorkout[] {
  const col = columnIndex(header);
  const date = col("date");
  const workoutName = col("workout name");
  const duration = col("duration", "workout duration");
  const exerciseName = col("exercise name");
  const setOrder = col("set order");
  const weight = col("weight");
  const weightUnit = col("weight unit");
  const reps = col("reps");
  const distance = col("distance");
  const seconds = col("seconds");
  const notes = col("notes");
  const workoutNotes = col("workout notes");
  const rpe = col("rpe");

  const builder = new WorkoutBuilder();
  for (const row of rows) {
    const startedAt = parseStrongDate(cell(row, date));
    const kind = strongSetKind(cell(row, setOrder));
    const name = cell(row, exerciseName);
    if (!startedAt || !kind || !name) continue;

    const title = cell(row, workoutName);
    const workout = builder.workout(`${cell(row, date)}\u0000${title}`, () => {
      const durationSeconds = parseDurationSeconds(cell(row, duration));
      return {
        name: title || null,
        startedAt,
        endedAt: durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null,
        notes: cell(row, workoutNotes) || null,
        exercises: [],
      };
    });
    const set: ImportedSet = {
      kind,
      weight: positive(cell(row, weight)),
      weightUnit: parseUnit(cell(row, weightUnit)),
      reps: positive(cell(row, reps)),
      durationSeconds: positive(cell(row, seconds)),
      distance: positive(cell(row, distance)),
      rpe: positive(cell(row, rpe)),
    };
    if (!hasData(set)) continue;
    builder.exercise(workout, name, cell(row, notes) || null, null).sets.push(set);
  }
  return builder.result();
}

function parseHevy(header: readonly string[], rows: readonly string[][]): ImportedWorkout[] {
  const col = columnIndex(header);
  const title = col("title");
  const start = col("start_time");
  const end = col("end_time");
  const description = col("description");
  const exerciseTitle = col("exercise_title");
  const superset = col("superset_id");
  const exerciseNotes = col("exercise_notes");
  const setType = col("set_type");
  const weightKg = col("weight_kg");
  const weightLbs = col("weight_lbs");
  const reps = col("reps");
  const distanceKm = col("distance_km");
  const distanceMiles = col("distance_miles");
  const duration = col("duration_seconds");
  const rpe = col("rpe");
  const unit: WeightUnit | null = weightKg !== -1 ? "kg" : weightLbs !== -1 ? "lb" : null;

  const builder = new WorkoutBuilder();
  for (const row of rows) {
    const startedAt = parseHevyDate(cell(row, start));
    const name = cell(row, exerciseTitle);
    if (!startedAt || !name) continue;

    const workoutTitle = cell(row, title);
    const workout = builder.workout(`${cell(row, start)}\u0000${workoutTitle}`, () => ({
      name: workoutTitle || null,
      startedAt,
      endedAt: parseHevyDate(cell(row, end)),
      notes: cell(row, description) || null,
      exercises: [],
    }));
    const set: ImportedSet = {
      kind: hevySetKind(cell(row, setType)),
      weight: positive(cell(row, unit === "kg" ? weightKg : weightLbs)),
      weightUnit: unit,
      reps: positive(cell(row, reps)),
      durationSeconds: positive(cell(row, duration)),
      distance: positive(cell(row, distanceKm !== -1 ? distanceKm : distanceMiles)),
      rpe: positive(cell(row, rpe)),
    };
    if (!hasData(set)) continue;
    const supersetKey = cell(row, superset) || null;
    builder.exercise(workout, name, cell(row, exerciseNotes) || null, supersetKey).sets.push(set);
  }
  return builder.result();
}

/** Reads a Strong or Hevy CSV export. Throws `WorkoutCsvError` for anything else. */
export function parseWorkoutCsv(text: string): ParsedWorkoutCsv {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new WorkoutCsvError("The file is empty.");
  const col = columnIndex(header);
  if (col("exercise_title") !== -1 && col("start_time") !== -1) {
    return { format: "hevy", workouts: parseHevy(header, rows) };
  }
  if (col("exercise name") !== -1 && col("date") !== -1 && col("set order") !== -1) {
    return { format: "strong", workouts: parseStrong(header, rows) };
  }
  throw new WorkoutCsvError("This doesn't look like a Strong or Hevy CSV export.");
}

const LB_PER_KG = 2.20462262;

/** Rounded to 2 decimals, the precision `sets.weight` stores. */
export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight;
  const converted = from === "kg" ? weight * LB_PER_KG : weight / LB_PER_KG;
  return Math.round(converted * 100) / 100;
}

/**
 * Catalog search queries for an imported exercise name, best first. Strong
 * and Hevy name exercises "Bench Press (Barbell)"; the catalog says
 * "Barbell Bench Press".
 */
export function exerciseNameQueries(name: string): string[] {
  const queries = [name];
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
  if (match) {
    const [, base = "", equipment = ""] = match;
    queries.push(`${equipment} ${base}`, base);
  }
  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

/** True when `name` is `exercise`'s name or one of its aliases, ignoring case and punctuation. */
export function isExactExerciseName(
  exercise: { name: string; aliases: readonly string[] },
  name: string,
): boolean {
  const target = normalize(name);
  return (
    normalize(exercise.name) === target || exercise.aliases.some((a) => normalize(a) === target)
  );
}

export interface ExportSet {
  kind: ImportSetKind;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distance: number | null;
  rpe: number | null;
}

export interface ExportWorkout {
  name: string | null;
  startedAt: Date;
  endedAt: Date | null;
  notes: string | null;
  exercises: { name: string; notes: string | null; sets: ExportSet[] }[];
}

export const STRONG_CSV_HEADER = [
  "Date",
  "Workout Name",
  "Duration",
  "Exercise Name",
  "Set Order",
  "Weight",
  "Reps",
  "Distance",
  "Seconds",
  "Notes",
  "Workout Notes",
  "RPE",
] as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** Local time, the way Strong writes it. */
export function formatStrongDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const SET_ORDER_LETTER: Partial<Record<ImportSetKind, string>> = {
  warmup: "W",
  drop: "D",
  failure: "F",
};

/** One row per set, in Strong's layout. Empty numbers are written as 0, as Strong does. */
export function toStrongCsv(workouts: readonly ExportWorkout[]): string {
  const rows: (string | number | null)[][] = [[...STRONG_CSV_HEADER]];
  for (const workout of workouts) {
    const duration = workout.endedAt
      ? formatStrongDuration((workout.endedAt.getTime() - workout.startedAt.getTime()) / 1000)
      : "";
    for (const exercise of workout.exercises) {
      let setNumber = 0;
      for (const set of exercise.sets) {
        const letter = SET_ORDER_LETTER[set.kind];
        rows.push([
          formatStrongDate(workout.startedAt),
          workout.name ?? "Workout",
          duration,
          exercise.name,
          letter ?? String(++setNumber),
          set.weight ?? 0,
          set.reps ?? 0,
          set.distance ?? 0,
          set.durationSeconds ?? 0,
          exercise.notes ?? "",
          workout.notes ?? "",
          set.rpe ?? "",
        ]);
      }
    }
  }
  return toCsv(rows);
}
