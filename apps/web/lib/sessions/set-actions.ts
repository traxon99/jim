import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type PersonalRecordRow, type SetRow, db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type PrCandidate,
  computePriorBests,
  deletedSessionExerciseIds,
  detectPersonalRecords,
  isWarmupExercise,
  resolveCurrentRows,
  restTakenSeconds,
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
    .filter((set) => !set.deletedAt && set.kind !== "warmup" && set.id !== excludeSetId)
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

interface RestBefore {
  restSeconds: number | null;
  restTargetSeconds: number | null;
}

const NO_REST: RestBefore = { restSeconds: null, restTargetSeconds: null };

/**
 * Rest taken before a set about to be logged (issue #233): the time since
 * the session's latest set, against the rest the timer ran after that set —
 * the exercise's own rest for this workout, else its routine's target rest,
 * else the default (the same rule session-exercise-section uses to start
 * the timer). Warm-up exercises have no rest timer, so a set logged after
 * one, or of one, has no rest; nor does one after an exercise set to no rest,
 * or one that follows its superset partner mid-round (issue #228: the rest
 * comes after each round, not each set).
 */
async function restBeforeNewSet(
  database: JimDatabase,
  sessionExerciseId: string,
  exerciseIsWarmup: boolean,
  now: Date,
): Promise<RestBefore> {
  if (exerciseIsWarmup) return NO_REST;
  const sessionExercise = await database.sessionExercises.get(sessionExerciseId);
  if (!sessionExercise) return NO_REST;
  const siblings = (
    await database.sessionExercises.where("sessionId").equals(sessionExercise.sessionId).toArray()
  ).filter((se) => !se.deletedAt);
  const rawSets = await database.sets
    .where("sessionExerciseId")
    .anyOf(siblings.map((se) => se.id))
    .toArray();
  let previous: SetRow | null = null;
  for (const set of resolveCurrentRows(rawSets)) {
    if (set.deletedAt) continue;
    if (!previous || set.completedAt > previous.completedAt) previous = set;
  }
  if (!previous) return NO_REST;
  const { sessionExerciseId: previousSessionExerciseId, completedAt } = previous;

  const previousItem = siblings.find((se) => se.id === previousSessionExerciseId);
  if (!previousItem) return NO_REST;
  // Moving on to a later member of the same superset is mid-round (no
  // timer); coming back to an earlier one starts the next round, after rest.
  const midRound =
    previousItem.supersetGroup != null &&
    previousItem.supersetGroup === sessionExercise.supersetGroup &&
    sessionExercise.position > previousItem.position;
  if (midRound) return NO_REST;
  const previousExerciseId = previousItem.exerciseId;
  const previousExercise = await database.exercises.get(previousExerciseId);
  if (previousExercise && isWarmupExercise(previousExercise)) return NO_REST;

  const session = await database.sessions.get(sessionExercise.sessionId);
  const routineItem = session?.routineId
    ? (await database.routineExercises.where("routineId").equals(session.routineId).toArray()).find(
        (item) => !item.deletedAt && item.exerciseId === previousExerciseId,
      )
    : undefined;
  const settings = (await database.settings.get("me")) ?? DEFAULT_SETTINGS;
  const restTargetSeconds =
    previousItem.restSeconds ??
    routineItem?.targetRestSeconds ??
    (Number(settings.defaultRestSeconds) || 90);
  if (restTargetSeconds <= 0) return NO_REST;
  return { restSeconds: restTakenSeconds(completedAt, now), restTargetSeconds };
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
 * progress (issue #59), so they never produce PRs — nor do warm-up sets of
 * a working exercise (issue #352).
 */
export async function completeSet(
  input: CompleteSetInput,
  database: JimDatabase = db,
): Promise<CompleteSetResult> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const exercise = await database.exercises.get(input.exerciseId);
  const exerciseIsWarmup = exercise != null && isWarmupExercise(exercise);
  const rest = await restBeforeNewSet(database, input.sessionExerciseId, exerciseIsWarmup, now);

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
    restSeconds: rest.restSeconds,
    restTargetSeconds: rest.restTargetSeconds,
    completedAt: now,
    supersedesId: null,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("sets", set, database);

  if (exerciseIsWarmup || set.kind === "warmup") return { set, prs: [] };

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

/**
 * Also append-only: "deleting" a set inserts a superseding row carrying a
 * `deletedAt` tombstone. Returns the tombstone so the delete can be undone
 * (issue #318) with `restoreSet`.
 */
export async function deleteSet(original: SetRow, database: JimDatabase = db): Promise<SetRow> {
  const tombstone: SetRow = {
    ...original,
    id: uuidv7(),
    supersedesId: original.id,
    deletedAt: new Date(),
  };
  await mutate("sets", tombstone, database);
  return tombstone;
}

/**
 * Undoes a `deleteSet` (issue #318): one more superseding row, this time
 * clearing the tombstone, so the set comes back with its logged values.
 */
export async function restoreSet(tombstone: SetRow, database: JimDatabase = db): Promise<SetRow> {
  const restored: SetRow = {
    ...tombstone,
    id: uuidv7(),
    supersedesId: tombstone.id,
    deletedAt: null,
  };
  await mutate("sets", restored, database);
  return restored;
}
