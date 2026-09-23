import { mutate } from "@/lib/db/mutate";
import { type JimDatabase, type RoutineExerciseRow, type RoutineRow, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { type WarmupTemplate, instantiateWarmupTemplate, uuidv7 } from "@jim/core";

/**
 * Adds a code-defined warm-up template (issue #59) to the user's routines
 * as their own warm-up routine. Slugs resolve against the global catalog
 * rows already on this device — a template stretch that hasn't synced down
 * yet is skipped (and reported) rather than blocking the add.
 */
export async function addWarmupTemplate(
  userId: string,
  template: WarmupTemplate,
  database: JimDatabase = db,
): Promise<{ routineId: string; missingSlugs: string[] }> {
  // Dexie can't index null, so the global rows (ownerId null) come from a scan.
  const globalExercises = (await database.exercises.toArray()).filter(
    (exercise) => exercise.ownerId == null,
  );
  const exerciseIdBySlug = new Map(globalExercises.map((exercise) => [exercise.slug, exercise.id]));

  const { routine, items, missingSlugs } = instantiateWarmupTemplate(
    template,
    exerciseIdBySlug,
    uuidv7,
  );

  const deviceId = await getDeviceId(database);
  const now = new Date();
  const position = await database.routines.count();

  const routineRow: RoutineRow = {
    ...routine,
    userId,
    position,
    folder: null,
    warmupRoutineId: null,
    createdAt: now,
    updatedAt: now,
    deviceId,
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("routines", routineRow, database);

  for (const item of items) {
    const row: RoutineExerciseRow = {
      ...item,
      userId,
      routineId: routine.id,
      supersetGroup: null,
      targetRestSeconds: null,
      targetWeight: null,
      progressionIncrement: null,
      progressionStartedAt: null,
      notes: null,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    };
    await mutate("routineExercises", row, database);
  }

  return { routineId: routine.id, missingSlugs };
}
