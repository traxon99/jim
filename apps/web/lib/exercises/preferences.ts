import { mutate } from "@/lib/db/mutate";
import { type ExercisePreferenceRow, type JimDatabase, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { type ExercisePreference, buildExercisePreferenceMap, uuidv7 } from "@jim/core";

/**
 * Exercise preference (issue #795, CONTEXT.md): Like / None / Dislike per
 * exercise slug. Outbox rows like sick days, so it works offline and syncs.
 */

async function liveRowsFor(slug: string, database: JimDatabase): Promise<ExercisePreferenceRow[]> {
  return (await database.exercisePreferences.where("exerciseSlug").equals(slug).toArray()).filter(
    (row) => !row.deletedAt,
  );
}

/** Slug → Like/Dislike from the local database. */
export async function loadExercisePreferences(
  database: JimDatabase = db,
): Promise<Map<string, ExercisePreference>> {
  return buildExercisePreferenceMap(await database.exercisePreferences.toArray());
}

/**
 * Sets the preference for `slug`; `null` is None. Reuses the newest live
 * row and tombstones any others (two devices may each have written one).
 */
export async function setExercisePreference(
  userId: string,
  slug: string,
  preference: ExercisePreference | null,
  database: JimDatabase = db,
): Promise<void> {
  const rows = (await liveRowsFor(slug, database)).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const now = new Date();
  const deviceId = await getDeviceId(database);
  const [newest, ...older] = rows;
  for (const row of older) {
    await mutate(
      "exercisePreferences",
      { ...row, deletedAt: now, updatedAt: now, deviceId },
      database,
    );
  }
  if (preference === null) {
    if (newest) {
      await mutate(
        "exercisePreferences",
        { ...newest, deletedAt: now, updatedAt: now, deviceId },
        database,
      );
    }
    return;
  }
  if (newest) {
    if (newest.preference === preference && older.length === 0) return;
    await mutate(
      "exercisePreferences",
      { ...newest, preference, updatedAt: now, deviceId },
      database,
    );
    return;
  }
  await mutate(
    "exercisePreferences",
    {
      id: uuidv7(),
      userId,
      exerciseSlug: slug,
      preference,
      createdAt: now,
      updatedAt: now,
      deviceId,
      deletedAt: null,
      serverSeq: 0,
    },
    database,
  );
}
