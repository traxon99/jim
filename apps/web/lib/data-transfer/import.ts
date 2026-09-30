import {
  type ExerciseRow,
  type JimDatabase,
  type OutboxEntry,
  type PersonalRecordRow,
  type SessionExerciseRow,
  type SessionRow,
  type SetRow,
  type SyncTableRowMap,
  db,
} from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { getDeviceId } from "@/lib/sync/engine";
import {
  EMPTY_PRIOR_BESTS,
  type ImportedWorkout,
  type PriorBests,
  type WeightUnit,
  type WorkoutCsvFormat,
  computePriorBests,
  convertWeight,
  deletedSessionExerciseIds,
  detectPersonalRecords,
  exerciseNameQueries,
  isExactExerciseName,
  isWarmupExercise,
  parseWorkoutCsv,
  preferOwnedExercises,
  resolveCurrentRows,
  searchExercises,
  slugify,
  tracksRepsAtWeight,
  uuidv7,
} from "@jim/core";

/**
 * Strong/Hevy CSV import (issue #241). Imported workouts are written like
 * logged ones — each row through the outbox, sets append-only (ADR-003) —
 * so they sync, and show up in History, PRs, e1RM charts and volume.
 */

/** A workout's identity for duplicate detection: its start, to the second. */
function workoutKey(startedAt: Date): number {
  return Math.floor(startedAt.getTime() / 1000);
}

async function existingWorkoutKeys(database: JimDatabase): Promise<Set<number>> {
  const sessions = await database.sessions.toArray();
  return new Set(
    sessions.filter((session) => !session.deletedAt).map((s) => workoutKey(s.startedAt)),
  );
}

async function importCatalog(database: JimDatabase, userId: string): Promise<ExerciseRow[]> {
  const rows = await database.exercises.toArray();
  return preferOwnedExercises(rows, userId).filter((exercise) => !exercise.isArchived);
}

/**
 * The catalog exercise an imported name most likely means: an exact name or
 * alias match first (so re-importing Jim's own export maps straight back),
 * then the best fuzzy search hit. Null when nothing matches at all.
 */
export function suggestExercise<T extends ExerciseRow>(
  catalog: readonly T[],
  name: string,
): T | null {
  const queries = exerciseNameQueries(name);
  for (const query of queries) {
    const exact = catalog.find((exercise) => isExactExerciseName(exercise, query));
    if (exact) return exact;
  }
  for (const query of queries) {
    const [best] = searchExercises(catalog, query);
    if (best) return best;
  }
  return null;
}

export interface ImportExerciseSummary {
  name: string;
  setCount: number;
  /** The suggested catalog match, or null to create a custom exercise. */
  suggestedExerciseId: string | null;
}

export interface ImportPreview {
  format: WorkoutCsvFormat;
  /** Only the workouts not already in Jim. */
  workouts: ImportedWorkout[];
  duplicateCount: number;
  setCount: number;
  firstDate: Date | null;
  lastDate: Date | null;
  exercises: ImportExerciseSummary[];
  /** Some weights have no unit in the file (Strong's newer layout), so the user picks one. */
  needsUnit: boolean;
}

/** Parses a file and works out what importing it would add. Throws `WorkoutCsvError` for a bad file. */
export async function previewWorkoutImport(
  text: string,
  userId: string,
  database: JimDatabase = db,
): Promise<ImportPreview> {
  const parsed = parseWorkoutCsv(text);
  const existing = await existingWorkoutKeys(database);
  const seen = new Set<number>();
  const workouts: ImportedWorkout[] = [];
  let duplicateCount = 0;
  for (const workout of parsed.workouts) {
    const key = workoutKey(workout.startedAt);
    if (existing.has(key) || seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    workouts.push(workout);
  }

  const setCounts = new Map<string, number>();
  let setCount = 0;
  let needsUnit = false;
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      setCounts.set(exercise.name, (setCounts.get(exercise.name) ?? 0) + exercise.sets.length);
      setCount += exercise.sets.length;
      if (exercise.sets.some((set) => set.weight != null && set.weightUnit == null)) {
        needsUnit = true;
      }
    }
  }

  const catalog = await importCatalog(database, userId);
  const exercises = [...setCounts]
    .map(([name, count]) => ({
      name,
      setCount: count,
      suggestedExerciseId: suggestExercise(catalog, name)?.id ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    format: parsed.format,
    workouts,
    duplicateCount,
    setCount,
    firstDate: workouts[0]?.startedAt ?? null,
    lastDate: workouts.at(-1)?.startedAt ?? null,
    exercises,
    needsUnit,
  };
}

export interface CommitImportInput {
  userId: string;
  workouts: readonly ImportedWorkout[];
  /** Imported exercise name → catalog exercise id, or null to create a custom exercise. */
  mapping: Readonly<Record<string, string | null>>;
  /** The unit of weights the file doesn't label. */
  fileUnit: WeightUnit;
}

export interface ImportResult {
  sessions: number;
  sets: number;
  createdExercises: number;
  personalRecords: number;
  skippedDuplicates: number;
}

/** Without a recorded duration, assume two minutes per set. */
const ASSUMED_SECONDS_PER_SET = 120;

type PendingWrite = {
  [K in keyof SyncTableRowMap]: { table: K; entity: SyncTableRowMap[K] };
}[keyof SyncTableRowMap];

function customTrackingType(sets: ImportedWorkout["exercises"][number]["sets"]) {
  if (sets.some((set) => set.weight != null)) return "weight_reps" as const;
  if (sets.some((set) => set.durationSeconds != null)) return "time" as const;
  if (sets.some((set) => set.distance != null)) return "distance" as const;
  return "bodyweight" as const;
}

function mergeBests(prior: PriorBests, next: PriorBests): PriorBests {
  const repsAtWeight = { ...prior.repsAtWeight };
  for (const [key, reps] of Object.entries(next.repsAtWeight)) {
    repsAtWeight[key] = Math.max(repsAtWeight[key] ?? 0, reps);
  }
  return {
    oneRepMax: Math.max(prior.oneRepMax, next.oneRepMax),
    weight: Math.max(prior.weight, next.weight),
    volume: Math.max(prior.volume, next.volume),
    repsAtWeight,
  };
}

interface DatedSet {
  id: string | null;
  weight: number | null;
  reps: number | null;
  at: number;
}

/**
 * PRs the imported sets set, walking each exercise's history — what was
 * already logged plus what's being imported — in date order, the way live
 * logging would have found them. Warm-up exercises and warm-up sets never
 * produce PRs.
 */
async function importedPersonalRecords(
  database: JimDatabase,
  userId: string,
  deviceId: string,
  newSets: readonly { set: SetRow; exerciseId: string }[],
  now: Date,
): Promise<PersonalRecordRow[]> {
  const exerciseIds = [...new Set(newSets.map((entry) => entry.exerciseId))];
  const exercises = await database.exercises.bulkGet(exerciseIds);
  const warmups = new Set(
    exercises.filter((e) => e != null && isWarmupExercise(e)).map((e) => e?.id),
  );
  const repsAtWeightIds = new Set(
    exercises.filter((e) => e != null && tracksRepsAtWeight(e.trackingType)).map((e) => e?.id),
  );
  const [sessions, sessionExercises, rawSets] = await Promise.all([
    database.sessions.toArray(),
    database.sessionExercises.toArray(),
    database.sets.toArray(),
  ]);
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  const exerciseOf = new Map(
    sessionExercises.filter((se) => !deleted.has(se.id)).map((se) => [se.id, se.exerciseId]),
  );

  const history = new Map<string, DatedSet[]>();
  const add = (exerciseId: string, entry: DatedSet) => {
    if (warmups.has(exerciseId)) return;
    const list = history.get(exerciseId);
    if (list) list.push(entry);
    else history.set(exerciseId, [entry]);
  };
  for (const set of resolveCurrentRows(rawSets)) {
    const exerciseId = exerciseOf.get(set.sessionExerciseId);
    if (set.deletedAt || set.kind === "warmup" || !exerciseId || !exerciseIds.includes(exerciseId))
      continue;
    add(exerciseId, {
      id: null,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      at: set.completedAt.getTime(),
    });
  }
  for (const { set, exerciseId } of newSets) {
    if (set.kind === "warmup") continue;
    add(exerciseId, {
      id: set.id,
      weight: set.weight == null ? null : Number(set.weight),
      reps: set.reps,
      at: set.completedAt.getTime(),
    });
  }

  const records: PersonalRecordRow[] = [];
  for (const [exerciseId, entries] of history) {
    entries.sort((a, b) => a.at - b.at);
    let bests = EMPTY_PRIOR_BESTS;
    for (const entry of entries) {
      if (entry.id) {
        for (const pr of detectPersonalRecords(entry, bests, {
          repsAtWeight: repsAtWeightIds.has(exerciseId),
        })) {
          records.push({
            id: uuidv7(),
            userId,
            exerciseId,
            kind: pr.kind,
            value: String(pr.value),
            setId: entry.id,
            achievedAt: new Date(entry.at),
            updatedAt: now,
            deviceId,
            deletedAt: null,
            serverSeq: 0,
          });
        }
      }
      bests = mergeBests(bests, computePriorBests([entry]));
    }
  }
  return records;
}

/**
 * Writes the workouts, any custom exercises they need and the PRs they set,
 * in one transaction. Workouts that have appeared since the preview (say, a
 * second tap) are skipped, so importing the same file twice adds nothing.
 */
export async function commitWorkoutImport(
  input: CommitImportInput,
  database: JimDatabase = db,
): Promise<ImportResult> {
  const { userId } = input;
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const settings = (await database.settings.get("me")) ?? DEFAULT_SETTINGS;
  const targetUnit = settings.units;
  const existing = await existingWorkoutKeys(database);

  const workouts: ImportedWorkout[] = [];
  let skippedDuplicates = 0;
  for (const workout of input.workouts) {
    const key = workoutKey(workout.startedAt);
    if (existing.has(key)) {
      skippedDuplicates++;
      continue;
    }
    existing.add(key);
    workouts.push(workout);
  }

  const writes: PendingWrite[] = [];

  // Custom exercises for every name mapped to "create new".
  const exerciseIdByName = new Map<string, string>();
  const customSets = new Map<string, ImportedWorkout["exercises"][number]["sets"]>();
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const mapped = input.mapping[exercise.name];
      if (mapped) {
        exerciseIdByName.set(exercise.name, mapped);
      } else {
        const sets = customSets.get(exercise.name);
        if (sets) sets.push(...exercise.sets);
        else customSets.set(exercise.name, [...exercise.sets]);
      }
    }
  }
  for (const [name, sets] of customSets) {
    const entity: ExerciseRow = {
      id: uuidv7(),
      ownerId: userId,
      slug: slugify(name),
      name,
      aliases: [],
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: null,
      mechanic: null,
      force: null,
      level: null,
      trackingType: customTrackingType(sets),
      category: "strength",
      instructions: [],
      imageUrls: [],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      deviceId,
      serverSeq: 0,
    };
    exerciseIdByName.set(name, entity.id);
    writes.push({ table: "exercises", entity });
  }

  const newSets: { set: SetRow; exerciseId: string }[] = [];
  for (const workout of workouts) {
    const setTotal = workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    const startMs = workout.startedAt.getTime();
    const recordedSpan = workout.endedAt ? workout.endedAt.getTime() - startMs : 0;
    const spanMs = recordedSpan > 0 ? recordedSpan : setTotal * ASSUMED_SECONDS_PER_SET * 1000;
    const session: SessionRow = {
      id: uuidv7(),
      userId,
      routineId: null,
      name: workout.name,
      startedAt: workout.startedAt,
      endedAt: new Date(startMs + spanMs),
      notes: workout.notes,
      bodyweight: null,
      intensity: null,
      deviceId,
      updatedAt: now,
      deletedAt: null,
      serverSeq: 0,
    };
    writes.push({ table: "sessions", entity: session });

    const supersetGroups = new Map<string, number>();
    let setOrdinal = 0;
    workout.exercises.forEach((exercise, position) => {
      const exerciseId = exerciseIdByName.get(exercise.name);
      if (!exerciseId) return;
      let supersetGroup: number | null = null;
      if (exercise.supersetKey != null) {
        supersetGroup = supersetGroups.get(exercise.supersetKey) ?? supersetGroups.size + 1;
        supersetGroups.set(exercise.supersetKey, supersetGroup);
      }
      const sessionExercise: SessionExerciseRow = {
        id: uuidv7(),
        userId,
        sessionId: session.id,
        exerciseId,
        position,
        supersetGroup,
        notes: exercise.notes,
        stickyNote: null,
        restSeconds: null,
        warmupSets: null,
        updatedAt: now,
        deviceId,
        deletedAt: null,
        serverSeq: 0,
      };
      writes.push({ table: "sessionExercises", entity: sessionExercise });

      exercise.sets.forEach((imported, setIndex) => {
        setOrdinal++;
        const weight =
          imported.weight == null
            ? null
            : convertWeight(imported.weight, imported.weightUnit ?? input.fileUnit, targetUnit);
        const set: SetRow = {
          id: uuidv7(),
          userId,
          sessionExerciseId: sessionExercise.id,
          setIndex,
          kind: imported.kind,
          weight: weight == null ? null : String(weight),
          reps: imported.reps,
          durationSeconds: imported.durationSeconds,
          distance: imported.distance == null ? null : String(imported.distance),
          rpe: imported.rpe == null ? null : String(imported.rpe),
          rir: null,
          restSeconds: null,
          restTargetSeconds: null,
          completedAt: new Date(startMs + Math.round((spanMs * setOrdinal) / setTotal)),
          supersedesId: null,
          deletedAt: null,
          serverSeq: 0,
        };
        writes.push({ table: "sets", entity: set });
        newSets.push({ set, exerciseId });
      });
    });
  }

  // PRs need the new custom exercises' ids, but not their rows, so they can
  // be computed before anything is written.
  const records = await importedPersonalRecords(database, userId, deviceId, newSets, now);
  for (const entity of records) writes.push({ table: "personalRecords", entity });

  // Outbox ids set the push order, and plain UUIDv7s made in the same
  // millisecond don't sort in creation order — so give each its own
  // (slightly past) millisecond: parents always reach Postgres first.
  const base = Date.now() - writes.length;
  const outbox: OutboxEntry[] = writes.map((write, i) => ({
    id: uuidv7(base + i),
    table: write.table,
    entity: write.entity,
  }));

  const tables = [
    database.exercises,
    database.sessions,
    database.sessionExercises,
    database.sets,
    database.personalRecords,
    database.outbox,
  ];
  await database.transaction("rw", tables, async () => {
    const byTable = new Map<keyof SyncTableRowMap, SyncTableRowMap[keyof SyncTableRowMap][]>();
    for (const write of writes) {
      const rows = byTable.get(write.table);
      if (rows) rows.push(write.entity);
      else byTable.set(write.table, [write.entity]);
    }
    for (const [table, rows] of byTable) {
      // biome-ignore lint/suspicious/noExplicitAny: each group holds that table's own rows
      await (database[table] as any).bulkPut(rows);
    }
    await database.outbox.bulkPut(outbox);
  });

  return {
    sessions: workouts.length,
    sets: newSets.length,
    createdExercises: customSets.size,
    personalRecords: records.length,
    skippedDuplicates,
  };
}
