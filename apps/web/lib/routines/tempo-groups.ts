import { mutate } from "@/lib/db/mutate";
import {
  type ExerciseRow,
  type RoutineExerciseRow,
  type RoutineRow,
  db as defaultDb,
} from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  exerciseDisplayName,
  isCardioExercise,
  isWarmupExercise,
  isWarmupRoutine,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";

/** One lift in a Tempo sheet (issue #850): a routine exercise that takes a tempo. */
export interface TempoLift {
  item: RoutineExerciseRow;
  name: string;
}

export interface TempoGroup {
  routine: RoutineRow;
  lifts: TempoLift[];
}

/**
 * The lifts whose tempo a routine's or program's Tempo sheet sets, grouped
 * by routine in the order given (issue #850). A routine listed twice (a
 * program can run it more than once) shows once. Warm-up routines, and
 * warm-up and cardio exercises, take no tempo and are left out, as are
 * routines with no lifts left.
 */
export function tempoGroups(
  routineIds: readonly string[],
  routines: readonly RoutineRow[],
  items: readonly RoutineExerciseRow[],
  exercises: readonly ExerciseRow[],
): TempoGroup[] {
  const routinesById = new Map(routines.map((routine) => [routine.id, routine]));
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const groups: TempoGroup[] = [];
  for (const routineId of new Set(routineIds)) {
    const routine = routinesById.get(routineId);
    if (!routine || routine.deletedAt || isWarmupRoutine(routine)) continue;
    const lifts = items
      .filter((item) => item.routineId === routineId && !item.deletedAt)
      .sort((a, b) => a.position - b.position)
      .flatMap((item) => {
        const exercise = exercisesById.get(item.exerciseId);
        if (!exercise || isWarmupExercise(exercise) || isCardioExercise(exercise)) return [];
        return [{ item, name: exerciseDisplayName(exercise) }];
      });
    if (lifts.length > 0) groups.push({ routine, lifts });
  }
  return groups;
}

/** The Tempo sheet's groups for these routines, kept live. Undefined while loading. */
export function useTempoGroups(
  routineIds: readonly string[] | undefined,
): TempoGroup[] | undefined {
  // `key` stands in for the ids, so a new array with the same ids keeps the query.
  const key = routineIds?.join(",");
  return useLiveQuery(async () => {
    if (!routineIds) return undefined;
    const ids = [...new Set(routineIds)];
    const [routines, items, exercises] = await Promise.all([
      defaultDb.routines.bulkGet(ids),
      defaultDb.routineExercises.where("routineId").anyOf(ids).toArray(),
      defaultDb.exercises.toArray(),
    ]);
    return tempoGroups(
      routineIds,
      routines.filter((routine): routine is RoutineRow => routine !== undefined),
      items,
      exercises,
    );
  }, [key]);
}

/** Saves one tempo on these lifts, skipping any that already have it. */
export async function saveLiftTempos(
  items: readonly RoutineExerciseRow[],
  tempo: string | null,
  database = defaultDb,
): Promise<void> {
  const changed = items.filter((item) => (item.tempo ?? null) !== tempo);
  if (changed.length === 0) return;
  const deviceId = await getDeviceId(database);
  const now = new Date();
  for (const item of changed) {
    await mutate("routineExercises", { ...item, tempo, updatedAt: now, deviceId }, database);
  }
}
