import { MUSCLES, type Muscle } from "../exercises/muscles";
import { type ProgressionRule, parseProgressionRule } from "../progression/rules";
import {
  ROUTINE_ICON_COLORS,
  ROUTINE_ICON_SHAPES,
  type RoutineIconColor,
  type RoutineIconShape,
} from "../routines/icon";

// Routine and program share links (issue #254). Sharing freezes a routine or
// a program, with the routines and exercises it uses, into one self-contained
// snapshot that's stored server-side and never changes: later edits by the
// sharer don't reach anyone who opens the link. The snapshot holds no ids
// from the sharer's rows, only names, targets and order, so opening it shows
// nothing else of theirs; adding it copies it into the recipient's own rows.

export const SHARE_KINDS = ["routine", "program"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export const SHARE_SNAPSHOT_VERSION = 1;

/** Caps that keep a snapshot small enough to store and to check cheaply. */
export const SHARE_LIMITS = {
  routines: 40,
  itemsPerRoutine: 60,
  exercises: 400,
  programEntries: 60,
  name: 120,
  notes: 2000,
  instructions: 30,
  instructionLength: 1000,
} as const;

type TrackingType =
  | "weight_reps"
  | "time"
  | "distance"
  | "bodyweight"
  | "weighted_bodyweight"
  | "distance_time";
const TRACKING_TYPES: readonly TrackingType[] = [
  "weight_reps",
  "time",
  "distance",
  "bodyweight",
  "weighted_bodyweight",
  "distance_time",
];
type ExerciseCategory = "strength" | "warmup" | "cardio";
const CATEGORIES: readonly ExerciseCategory[] = ["strength", "warmup", "cardio"];
type Mechanic = "compound" | "isolation";
const MECHANICS: readonly Mechanic[] = ["compound", "isolation"];
type Force = "push" | "pull" | "static";
const FORCES: readonly Force[] = ["push", "pull", "static"];
type Level = "beginner" | "intermediate" | "expert";
const LEVELS: readonly Level[] = ["beginner", "intermediate", "expert"];
type RoutineKind = "strength" | "warmup";
const ROUTINE_KINDS: readonly RoutineKind[] = ["strength", "warmup"];
type ProgramMode = "sequence" | "weekly";
const PROGRAM_MODES: readonly ProgramMode[] = ["sequence", "weekly"];
type Units = "lb" | "kg";
const UNITS: readonly Units[] = ["lb", "kg"];

/** An exercise as the sharer had it. `global` marks one from the shared catalog. */
export interface SharedExercise {
  slug: string;
  name: string;
  global: boolean;
  trackingType: TrackingType;
  category: ExerciseCategory;
  equipment: string | null;
  mechanic: Mechanic | null;
  force: Force | null;
  level: Level | null;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  instructions: string[];
}

export interface SharedRoutineItem {
  /** Index into the snapshot's `exercises`. */
  exercise: number;
  supersetGroup: number | null;
  targetSets: number | null;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetRestSeconds: number | null;
  targetDurationSeconds: number | null;
  /** In the snapshot's `units`. */
  targetWeight: number | null;
  notes: string | null;
  /** Its increments are in the snapshot's `units` too. */
  progressionRule: ProgressionRule | null;
}

export interface SharedRoutine {
  name: string;
  notes: string | null;
  kind: RoutineKind;
  iconShape: RoutineIconShape;
  iconColor: RoutineIconColor;
  warmupMinutes: number | null;
  /** Index into the snapshot's `routines` of this routine's linked warm-up. */
  warmupRoutine: number | null;
  items: SharedRoutineItem[];
}

export interface SharedProgramEntry {
  /** Index into the snapshot's `routines`; null is a rest day. */
  routine: number | null;
  weekday: number | null;
}

export interface SharedProgram {
  name: string;
  notes: string | null;
  mode: ProgramMode;
  durationWeeks: number | null;
  entries: SharedProgramEntry[];
}

export interface ShareSnapshot {
  version: typeof SHARE_SNAPSHOT_VERSION;
  kind: ShareKind;
  units: Units;
  exercises: SharedExercise[];
  /** For a routine share, the shared routine is `routines[0]`. */
  routines: SharedRoutine[];
  program: SharedProgram | null;
}

// --- Building --------------------------------------------------------------

export interface ShareSourceExercise {
  id: string;
  ownerId: string | null;
  slug: string;
  name: string;
  trackingType: TrackingType;
  category: ExerciseCategory;
  equipment: string | null;
  mechanic: Mechanic | null;
  force: Force | null;
  level: Level | null;
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
  instructions: readonly string[];
}

export interface ShareSourceRoutine {
  id: string;
  name: string;
  notes: string | null;
  kind: RoutineKind;
  iconShape: RoutineIconShape;
  iconColor: RoutineIconColor;
  warmupMinutes: number | null;
  warmupRoutineId: string | null;
  deletedAt: Date | null;
}

export interface ShareSourceRoutineItem {
  routineId: string;
  exerciseId: string;
  position: number;
  supersetGroup: number | null;
  targetSets: number | null;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetRestSeconds: number | null;
  targetDurationSeconds: number | null;
  targetWeight: string | number | null;
  notes: string | null;
  progressionRule?: unknown;
  deletedAt: Date | null;
}

export interface ShareSourceProgram {
  name: string;
  notes: string | null;
  mode: ProgramMode;
  durationWeeks: number | null;
}

export interface ShareSourceProgramEntry {
  routineId: string | null;
  position: number;
  weekday: number | null;
  deletedAt: Date | null;
}

export interface ShareSource {
  units: Units;
  routines: readonly ShareSourceRoutine[];
  routineExercises: readonly ShareSourceRoutineItem[];
  exercises: readonly ShareSourceExercise[];
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Collects routines and exercises into a snapshot, each added once. */
class SnapshotBuilder {
  readonly exercises: SharedExercise[] = [];
  readonly routines: SharedRoutine[] = [];
  private readonly exerciseIndex = new Map<string, number>();
  private readonly routineIndex = new Map<string, number>();
  private readonly routinesById: Map<string, ShareSourceRoutine>;
  private readonly exercisesById: Map<string, ShareSourceExercise>;

  constructor(private readonly source: ShareSource) {
    this.routinesById = new Map(source.routines.map((routine) => [routine.id, routine]));
    this.exercisesById = new Map(source.exercises.map((exercise) => [exercise.id, exercise]));
  }

  private addExercise(id: string): number | null {
    const existing = this.exerciseIndex.get(id);
    if (existing !== undefined) return existing;
    const exercise = this.exercisesById.get(id);
    if (!exercise) return null;
    const index = this.exercises.length;
    this.exercises.push({
      slug: exercise.slug,
      name: exercise.name,
      global: exercise.ownerId == null,
      trackingType: exercise.trackingType,
      category: exercise.category,
      equipment: exercise.equipment,
      mechanic: exercise.mechanic,
      force: exercise.force,
      level: exercise.level,
      primaryMuscles: [...exercise.primaryMuscles],
      secondaryMuscles: [...exercise.secondaryMuscles],
      instructions: [...exercise.instructions],
    });
    this.exerciseIndex.set(id, index);
    return index;
  }

  /** Adds a live routine (and its linked warm-up); null when it's gone. */
  addRoutine(id: string): number | null {
    const existing = this.routineIndex.get(id);
    if (existing !== undefined) return existing;
    const routine = this.routinesById.get(id);
    if (!routine || routine.deletedAt) return null;

    const index = this.routines.length;
    this.routineIndex.set(id, index);
    const shared: SharedRoutine = {
      name: routine.name,
      notes: blankToNull(routine.notes),
      kind: routine.kind,
      iconShape: routine.iconShape,
      iconColor: routine.iconColor,
      warmupMinutes: routine.warmupMinutes,
      warmupRoutine: null,
      items: [],
    };
    this.routines.push(shared);

    const items = this.source.routineExercises
      .filter((item) => item.routineId === id && !item.deletedAt)
      .sort((a, b) => a.position - b.position);
    for (const item of items) {
      const exercise = this.addExercise(item.exerciseId);
      if (exercise === null) continue;
      const weight = item.targetWeight == null ? null : Number(item.targetWeight);
      shared.items.push({
        exercise,
        supersetGroup: item.supersetGroup,
        targetSets: item.targetSets,
        targetRepsLow: item.targetRepsLow,
        targetRepsHigh: item.targetRepsHigh,
        targetRestSeconds: item.targetRestSeconds,
        targetDurationSeconds: item.targetDurationSeconds,
        targetWeight: weight != null && Number.isFinite(weight) ? weight : null,
        notes: blankToNull(item.notes),
        progressionRule: parseProgressionRule(item.progressionRule),
      });
    }

    if (routine.warmupRoutineId && routine.warmupRoutineId !== id) {
      shared.warmupRoutine = this.addRoutine(routine.warmupRoutineId);
    }
    return index;
  }
}

/** A snapshot of one routine (plus its linked warm-up), or null when it's gone. */
export function buildRoutineShare(routineId: string, source: ShareSource): ShareSnapshot | null {
  const builder = new SnapshotBuilder(source);
  if (builder.addRoutine(routineId) !== 0) return null;
  return {
    version: SHARE_SNAPSHOT_VERSION,
    kind: "routine",
    units: source.units,
    exercises: builder.exercises,
    routines: builder.routines,
    program: null,
  };
}

/** A snapshot of a program with every routine on it, in its order. */
export function buildProgramShare(
  program: ShareSourceProgram,
  entries: readonly ShareSourceProgramEntry[],
  source: ShareSource,
): ShareSnapshot {
  const builder = new SnapshotBuilder(source);
  const sharedEntries: SharedProgramEntry[] = [];
  const live = entries.filter((entry) => !entry.deletedAt).sort((a, b) => a.position - b.position);
  for (const entry of live) {
    if (entry.routineId === null) {
      sharedEntries.push({ routine: null, weekday: entry.weekday });
      continue;
    }
    const routine = builder.addRoutine(entry.routineId);
    if (routine !== null) sharedEntries.push({ routine, weekday: entry.weekday });
  }
  return {
    version: SHARE_SNAPSHOT_VERSION,
    kind: "program",
    units: source.units,
    exercises: builder.exercises,
    routines: builder.routines,
    program: {
      name: program.name,
      notes: blankToNull(program.notes),
      mode: program.mode,
      durationWeeks: program.durationWeeks,
      entries: sharedEntries,
    },
  };
}

// --- Parsing ---------------------------------------------------------------

/** Thrown inside parseShareSnapshot to bail out on the first bad field. */
class Invalid extends Error {}

function fail(): never {
  throw new Invalid();
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) && value.length <= max ? value : fail();
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T)
    : fail();
}

function maybeOneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return value == null ? null : oneOf(value, options);
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") fail();
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : fail();
}

function maybeText(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) fail();
  return blankToNull(value);
}

function int(value: unknown, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fail();
}

function maybeInt(value: unknown, min: number, max: number): number | null {
  return value == null ? null : int(value, min, max);
}

/**
 * The ceiling for the integer targets (sets, reps, rest, duration, warm-up
 * minutes, superset groups): Postgres's `integer`. The routine editors
 * don't cap these, so a tighter cap here would refuse to share a routine
 * the app saved without complaint (a 900-minute warm-up did).
 */
const PG_INT_MAX = 2_147_483_647;

function maybeWeight(value: unknown): number | null {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 100000
    ? value
    : fail();
}

function parseExercise(value: unknown): SharedExercise {
  const raw = record(value);
  if (typeof raw.global !== "boolean") fail();
  return {
    slug: text(raw.slug, 200),
    name: text(raw.name, SHARE_LIMITS.name),
    global: raw.global,
    trackingType: oneOf(raw.trackingType, TRACKING_TYPES),
    category: oneOf(raw.category, CATEGORIES),
    equipment: maybeText(raw.equipment, SHARE_LIMITS.name),
    mechanic: maybeOneOf(raw.mechanic, MECHANICS),
    force: maybeOneOf(raw.force, FORCES),
    level: maybeOneOf(raw.level, LEVELS),
    primaryMuscles: list(raw.primaryMuscles, MUSCLES.length).map((m) => oneOf(m, MUSCLES)),
    secondaryMuscles: list(raw.secondaryMuscles, MUSCLES.length).map((m) => oneOf(m, MUSCLES)),
    instructions: list(raw.instructions, SHARE_LIMITS.instructions).map((line) =>
      text(line, SHARE_LIMITS.instructionLength),
    ),
  };
}

function parseItem(value: unknown, exerciseCount: number): SharedRoutineItem {
  const raw = record(value);
  return {
    exercise: int(raw.exercise, 0, exerciseCount - 1),
    supersetGroup: maybeInt(raw.supersetGroup, 0, PG_INT_MAX),
    targetSets: maybeInt(raw.targetSets, 0, PG_INT_MAX),
    targetRepsLow: maybeInt(raw.targetRepsLow, 0, PG_INT_MAX),
    targetRepsHigh: maybeInt(raw.targetRepsHigh, 0, PG_INT_MAX),
    targetRestSeconds: maybeInt(raw.targetRestSeconds, 0, PG_INT_MAX),
    targetDurationSeconds: maybeInt(raw.targetDurationSeconds, 0, PG_INT_MAX),
    targetWeight: maybeWeight(raw.targetWeight),
    notes: maybeText(raw.notes, SHARE_LIMITS.notes),
    progressionRule:
      raw.progressionRule == null ? null : (parseProgressionRule(raw.progressionRule) ?? fail()),
  };
}

function parseRoutine(value: unknown, exerciseCount: number, routineCount: number): SharedRoutine {
  const raw = record(value);
  return {
    name: text(raw.name, SHARE_LIMITS.name),
    notes: maybeText(raw.notes, SHARE_LIMITS.notes),
    kind: oneOf(raw.kind, ROUTINE_KINDS),
    iconShape: oneOf(raw.iconShape, ROUTINE_ICON_SHAPES),
    iconColor: oneOf(raw.iconColor, ROUTINE_ICON_COLORS),
    warmupMinutes: maybeInt(raw.warmupMinutes, 0, PG_INT_MAX),
    warmupRoutine: maybeInt(raw.warmupRoutine, 0, routineCount - 1),
    items: list(raw.items, SHARE_LIMITS.itemsPerRoutine).map((item) =>
      parseItem(item, exerciseCount),
    ),
  };
}

function parseProgram(value: unknown, routineCount: number): SharedProgram {
  const raw = record(value);
  return {
    name: text(raw.name, SHARE_LIMITS.name),
    notes: maybeText(raw.notes, SHARE_LIMITS.notes),
    mode: oneOf(raw.mode, PROGRAM_MODES),
    durationWeeks: maybeInt(raw.durationWeeks, 1, PG_INT_MAX),
    entries: list(raw.entries, SHARE_LIMITS.programEntries).map((entry) => {
      const rawEntry = record(entry);
      return {
        routine: maybeInt(rawEntry.routine, 0, routineCount - 1),
        weekday: maybeInt(rawEntry.weekday, 0, 6),
      };
    }),
  };
}

/**
 * A snapshot from untrusted JSON (a request body, or a stored row read back),
 * or null when anything about it is off. Unknown fields are dropped.
 */
export function parseShareSnapshot(value: unknown): ShareSnapshot | null {
  try {
    const raw = record(value);
    if (raw.version !== SHARE_SNAPSHOT_VERSION) fail();
    const kind = oneOf(raw.kind, SHARE_KINDS);
    const exercises = list(raw.exercises, SHARE_LIMITS.exercises).map(parseExercise);
    const rawRoutines = list(raw.routines, SHARE_LIMITS.routines);
    const routines = rawRoutines.map((routine) =>
      parseRoutine(routine, exercises.length, rawRoutines.length),
    );
    const program = kind === "program" ? parseProgram(raw.program, routines.length) : null;
    if (kind === "routine" && routines.length === 0) fail();
    if (kind === "program" && routines.length === 0) fail();
    return {
      version: SHARE_SNAPSHOT_VERSION,
      kind,
      units: oneOf(raw.units, UNITS),
      exercises,
      routines,
      program,
    };
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

/** The snapshot's title: the program's name, or the shared routine's. */
export function shareSnapshotName(snapshot: ShareSnapshot): string {
  return snapshot.program?.name ?? snapshot.routines[0]?.name ?? "Shared routine";
}

// --- Importing -------------------------------------------------------------

export interface RecipientExercise {
  id: string;
  ownerId: string | null;
  slug: string;
  name: string;
  category: ExerciseCategory;
  isArchived: boolean;
}

/** Per snapshot exercise: an id from the recipient's catalog, or null to copy it in. */
export type ShareExerciseMatch = string | null;

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Matches each exercise in a snapshot to the recipient's catalog: their own
 * exercise with the same slug (a clone of a catalog lift, or a custom one of
 * the same name), then the catalog's by slug, then either by name. Anything
 * left over is copied in as a new custom exercise (null here).
 */
export function matchShareExercises(
  snapshot: ShareSnapshot,
  recipient: readonly RecipientExercise[],
): ShareExerciseMatch[] {
  const usable = recipient.filter((exercise) => !exercise.isArchived);
  const own = usable.filter((exercise) => exercise.ownerId != null);
  const global = usable.filter((exercise) => exercise.ownerId == null);
  const index = (rows: readonly RecipientExercise[], key: (row: RecipientExercise) => string) => {
    const map = new Map<string, RecipientExercise>();
    for (const row of rows) if (!map.has(key(row))) map.set(key(row), row);
    return map;
  };
  const bySlug = (row: RecipientExercise) => `${row.category}:${row.slug}`;
  const byName = (row: RecipientExercise) => `${row.category}:${nameKey(row.name)}`;
  const ownBySlug = index(own, bySlug);
  const globalBySlug = index(global, bySlug);
  const ownByName = index(own, byName);
  const globalByName = index(global, byName);

  return snapshot.exercises.map((exercise) => {
    const slugKey = `${exercise.category}:${exercise.slug}`;
    const nameMatch = `${exercise.category}:${nameKey(exercise.name)}`;
    return (
      (
        ownBySlug.get(slugKey) ??
        globalBySlug.get(slugKey) ??
        ownByName.get(nameMatch) ??
        globalByName.get(nameMatch)
      )?.id ?? null
    );
  });
}

const LB_PER_KG = 2.20462262;

/**
 * A starting weight in the recipient's units. Converted weights land on a
 * 5 lb or 2.5 kg step (a pair of the smallest common plates), never raw math.
 */
export function convertShareWeight(weight: number | null, from: Units, to: Units): number | null {
  if (weight == null || from === to) return weight;
  if (to === "kg") return Math.round(weight / LB_PER_KG / 2.5) * 2.5;
  return Math.round((weight * LB_PER_KG) / 5) * 5;
}

/**
 * A progression rule in the recipient's units: its weight increment lands
 * on a 2.5 lb or 1.25 kg step (one pair of the smallest common plates).
 */
export function convertShareRule(
  rule: ProgressionRule | null,
  from: Units,
  to: Units,
): ProgressionRule | null {
  if (rule == null || from === to) return rule;
  const increment =
    to === "kg"
      ? Math.max(1.25, Math.round(rule.increment / LB_PER_KG / 1.25) * 1.25)
      : Math.max(2.5, Math.round((rule.increment * LB_PER_KG) / 2.5) * 2.5);
  return { ...rule, increment };
}
