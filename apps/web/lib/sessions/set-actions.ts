import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type PersonalRecordRow, type SetRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type PrCandidate,
  computePriorBests,
  deletedSessionExerciseIds,
  detectPersonalRecords,
  isWarmupExercise,
  resolveCurrentRows,
  uuidv7,
} from "@jim/core";

async function historicalWeightReps(
  database: JimDatabase,
  exerciseId: string,
  excludeSetId?: string,
): Promise<{ weight: number | null; reps: number | null }[]> {
  const sessionExercises = await database.sessionExercises
    .where("exerciseId")
    .equals(exerciseId)
    .toArray();
  // A deleted workout's sets aren't history to beat (issue #200).
  const sessions = await database.sessions.bulkGet([
    ...new Set(sessionExercises.map((se) => se.sessionId)),
  ]);
  const deleted = deletedSessionExerciseIds(
    sessions.filter((session) => session != null),
    sessionExercises,
  );
  const sessionExerciseIds = sessionExercises.map((se) => se.id).filter((id) => !deleted.has(id));
  if (sessionExerciseIds.length === 0) return [];

  const rawSets = await database.sets
    .where("sessionExerciseId")
    .anyOf(sessionExerciseIds)
    .toArray();
  return resolveCurrentRows(rawSets)
    .filter((set) => !set.deletedAt && set.id !== excludeSetId)
    .map((set) => ({ weight: set.weight == null ? null : Number(set.weight), reps: set.reps }));
}

async function detectAndRecordPrs(
  database: JimDatabase,
  userId: string,
  exerciseId: string,
  set: SetRow,
  deviceId: string,
  now: Date,
): Promise<PrCandidate[]> {
  const history = await historicalWeightReps(database, exerciseId, set.id);
  const prior = computePriorBests(history);
  const candidate = { weight: set.weight == null ? null : Number(set.weight), reps: set.reps };
  const prs = detectPersonalRecords(candidate, prior);

  for (const pr of prs) {
    const record: PersonalRecordRow = {
      id: uuidv7(),
      userId,
      exerciseId,
      kind: pr.kind,
      value: String(pr.value),
      setId: set.id,
      achievedAt: now,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("personalRecords", record, database);
  }

  return prs;
}

export interface CompleteSetInput {
  userId: string;
  sessionExerciseId: string;
  exerciseId: string;
  setIndex: number;
  kind: SetRow["kind"];
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  /** For time-tracked exercises, e.g. a held stretch (issue #59). */
  durationSeconds?: number | null;
}

export interface CompleteSetResult {
  set: SetRow;
  prs: PrCandidate[];
}

/**
 * Logs a brand-new set and checks it against this exercise's history for a
 * PR, live (STORIES.md S6). Warm-ups are tracked for frequency, not
 * progress (issue #59), so they never produce PRs.
 */
export async function completeSet(
  input: CompleteSetInput,
  database: JimDatabase = db,
): Promise<CompleteSetResult> {
  const deviceId = await getDeviceId(database);
  const now = new Date();

  const set: SetRow = {
    id: uuidv7(),
    userId: input.userId,
    sessionExerciseId: input.sessionExerciseId,
    setIndex: input.setIndex,
    kind: input.kind,
    weight: input.weight == null ? null : String(input.weight),
    reps: input.reps,
    durationSeconds: input.durationSeconds ?? null,
    distance: null,
    rpe: input.rpe == null ? null : String(input.rpe),
    rir: null,
    completedAt: now,
    supersedesId: null,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("sets", set, database);

  const exercise = await database.exercises.get(input.exerciseId);
  if (exercise && isWarmupExercise(exercise)) return { set, prs: [] };

  const prs = await detectAndRecordPrs(
    database,
    input.userId,
    input.exerciseId,
    set,
    deviceId,
    now,
  );
  return { set, prs };
}

export interface EditSetInput {
  original: SetRow;
  weight: number | null;
  reps: number | null;
  kind: SetRow["kind"];
  rpe?: number | null;
}

/** ADR-003: sets are append-only — an edit inserts a new row carrying `supersedesId` rather than UPDATEing. */
export async function editSet(input: EditSetInput, database: JimDatabase = db): Promise<SetRow> {
  const updated: SetRow = {
    ...input.original,
    id: uuidv7(),
    weight: input.weight == null ? null : String(input.weight),
    reps: input.reps,
    kind: input.kind,
    rpe: input.rpe == null ? null : String(input.rpe),
    supersedesId: input.original.id,
    deletedAt: null,
  };
  await mutate("sets", updated, database);
  return updated;
}

/**
 * Quick set-type change (issue #161: tapping the set number opens a menu of
 * set types) — same append-only supersede as `editSet`, but touches nothing
 * else about the set.
 */
export async function updateSetKind(
  original: SetRow,
  kind: SetRow["kind"],
  database: JimDatabase = db,
): Promise<SetRow> {
  const updated: SetRow = {
    ...original,
    id: uuidv7(),
    kind,
    supersedesId: original.id,
    deletedAt: null,
  };
  await mutate("sets", updated, database);
  return updated;
}

/** Also append-only: "deleting" a set inserts a superseding row carrying a `deletedAt` tombstone. */
export async function deleteSet(original: SetRow, database: JimDatabase = db): Promise<void> {
  const tombstone: SetRow = {
    ...original,
    id: uuidv7(),
    supersedesId: original.id,
    deletedAt: new Date(),
  };
  await mutate("sets", tombstone, database);
}
