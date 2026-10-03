import { mutate } from "@/lib/db/mutate";
import {
  type JimDatabase,
  type RoutineExerciseRow,
  type RoutineRow,
  type SessionRow,
  db,
} from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  type RoutineChangeSessionItem,
  type RoutineChanges,
  diffSessionAgainstRoutine,
  hasRoutineChanges,
  isWarmupExercise,
  partitionWarmups,
  planRoutineUpdate,
  resolveCurrentRows,
  uuidv7,
} from "@jim/core";

/** A finished workout set against the routine it was started from (issue #407). */
export interface SessionRoutineComparison {
  routine: RoutineRow;
  routineItems: RoutineExerciseRow[];
  sessionMain: RoutineChangeSessionItem[];
  warmupExerciseIds: Set<string>;
  changes: RoutineChanges;
}

/**
 * What a finished workout changed relative to its routine, or null when
 * there's nothing to offer: no routine, the routine is gone, nothing
 * changed, or the routine has been edited since the workout ended (an old
 * summary shouldn't offer to undo a later edit).
 */
export async function compareSessionToRoutine(
  session: SessionRow,
  database: JimDatabase = db,
): Promise<SessionRoutineComparison | null> {
  if (!session.routineId || !session.endedAt) return null;
  const routine = await database.routines.get(session.routineId);
  if (!routine || routine.deletedAt) return null;

  const allRoutineItems = await database.routineExercises
    .where("routineId")
    .equals(routine.id)
    .toArray();
  const endedAt = session.endedAt.getTime();
  if ([routine, ...allRoutineItems].some((row) => row.updatedAt.getTime() > endedAt)) return null;
  const routineItems = allRoutineItems.filter((item) => !item.deletedAt);

  const sessionItems = (
    await database.sessionExercises.where("sessionId").equals(session.id).toArray()
  )
    .filter((se) => !se.deletedAt)
    .sort((a, b) => a.position - b.position);

  const exerciseIds = [
    ...new Set([...routineItems, ...sessionItems].map((item) => item.exerciseId)),
  ];
  const exercises = await database.exercises.bulkGet(exerciseIds);
  const warmupExerciseIds = new Set(
    exercises.flatMap((exercise) => (exercise && isWarmupExercise(exercise) ? [exercise.id] : [])),
  );
  const isWarmup = (exerciseId: string) => warmupExerciseIds.has(exerciseId);

  const { main } = partitionWarmups(sessionItems, isWarmup);
  const sets =
    main.length > 0
      ? await database.sets
          .where("sessionExerciseId")
          .anyOf(main.map((se) => se.id))
          .toArray()
      : [];
  const workingSetCounts = new Map<string, number>();
  for (const set of resolveCurrentRows(sets)) {
    if (set.deletedAt || set.kind === "warmup") continue;
    workingSetCounts.set(
      set.sessionExerciseId,
      (workingSetCounts.get(set.sessionExerciseId) ?? 0) + 1,
    );
  }

  const sessionMain: RoutineChangeSessionItem[] = main.map((se) => ({
    exerciseId: se.exerciseId,
    supersetGroup: se.supersetGroup,
    restSeconds: se.restSeconds,
    workingSetCount: workingSetCounts.get(se.id) ?? 0,
  }));
  // A workout with no main exercises left is an abandoned plan, not a new one.
  if (sessionMain.length === 0) return null;

  const changes = diffSessionAgainstRoutine(routineItems, sessionMain, isWarmup);
  if (!hasRoutineChanges(changes)) return null;
  return { routine, routineItems, sessionMain, warmupExerciseIds, changes };
}

/** Writes the workout's changes into its routine: the "Update routine" action. */
export async function saveSessionChangesToRoutine(
  userId: string,
  comparison: SessionRoutineComparison,
  database: JimDatabase = db,
): Promise<void> {
  const { routine, routineItems, sessionMain, warmupExerciseIds } = comparison;
  const plan = planRoutineUpdate(routineItems, sessionMain, (exerciseId) =>
    warmupExerciseIds.has(exerciseId),
  );
  const deviceId = await getDeviceId(database);
  const now = new Date();
  const itemById = new Map(routineItems.map((item) => [item.id, item]));

  for (const id of plan.removals) {
    const item = itemById.get(id);
    if (!item) continue;
    await mutate(
      "routineExercises",
      { ...item, deletedAt: now, updatedAt: now, deviceId },
      database,
    );
  }
  for (const update of plan.updates) {
    const item = itemById.get(update.id);
    if (!item) continue;
    await mutate(
      "routineExercises",
      {
        ...item,
        position: update.position,
        supersetGroup: update.supersetGroup,
        targetRestSeconds: update.targetRestSeconds,
        updatedAt: now,
        deviceId,
      },
      database,
    );
  }
  for (const addition of plan.additions) {
    const entity: RoutineExerciseRow = {
      id: uuidv7(),
      userId,
      routineId: routine.id,
      exerciseId: addition.exerciseId,
      position: addition.position,
      supersetGroup: addition.supersetGroup,
      targetSets: addition.targetSets,
      targetRepsLow: null,
      targetRepsHigh: null,
      targetRestSeconds: addition.targetRestSeconds,
      targetDurationSeconds: null,
      targetWeight: null,
      notes: null,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("routineExercises", entity, database);
  }
}

/** One short line per kind of change, for the card on the workout summary. */
export function describeRoutineChanges(
  changes: RoutineChanges,
  exerciseName: (exerciseId: string) => string,
): string[] {
  const names = (ids: readonly string[]) => ids.map(exerciseName).join(", ");
  const lines: string[] = [];
  if (changes.added.length > 0) lines.push(`Added ${names(changes.added)}`);
  if (changes.removed.length > 0) lines.push(`Removed ${names(changes.removed)}`);
  if (changes.reordered) lines.push("Changed the exercise order");
  if (changes.supersetsChanged) lines.push("Changed supersets");
  if (changes.restChanged.length > 0) lines.push(`Changed rest for ${names(changes.restChanged)}`);
  return lines;
}
