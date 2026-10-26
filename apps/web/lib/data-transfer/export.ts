import { type JimDatabase, db } from "@/lib/db/schema";
import { jsonExportFromTables, strongCsvFromTables } from "./export-build";

export { exportFileName, saveFile } from "./export-build";

/**
 * Full data export (issue #242), read straight from IndexedDB so it works
 * offline. The files themselves are built in `export-build.ts`, which
 * desktop Analysis shares.
 */

/** Finished workouts in Strong's CSV layout, one row per set, weights in the user's units. */
export async function buildStrongCsvExport(database: JimDatabase = db): Promise<string> {
  const [sessions, sessionExercises, sets, exercises] = await Promise.all([
    database.sessions.toArray(),
    database.sessionExercises.toArray(),
    database.sets.toArray(),
    database.exercises.toArray(),
  ]);
  return strongCsvFromTables({ sessions, sessionExercises, sets, exercises });
}

/** Everything the user owns, as JSON (see `jsonExportFromTables`). */
export async function buildJsonExport(database: JimDatabase = db): Promise<string> {
  const [
    sessions,
    sessionExercises,
    sets,
    exercises,
    routines,
    routineExercises,
    programs,
    programRoutines,
    personalRecords,
    bodyMeasurements,
    dprBlocks,
    dprBlockLifts,
    gyms,
    injuries,
    painCheckins,
    settings,
  ] = await Promise.all([
    database.sessions.toArray(),
    database.sessionExercises.toArray(),
    database.sets.toArray(),
    database.exercises.toArray(),
    database.routines.toArray(),
    database.routineExercises.toArray(),
    database.programs.toArray(),
    database.programRoutines.toArray(),
    database.personalRecords.toArray(),
    database.bodyMeasurements.toArray(),
    database.dprBlocks.toArray(),
    database.dprBlockLifts.toArray(),
    database.gyms.toArray(),
    database.injuries.toArray(),
    database.painCheckins.toArray(),
    database.settings.get("me"),
  ]);
  return jsonExportFromTables({
    sessions,
    sessionExercises,
    sets,
    exercises,
    routines,
    routineExercises,
    programs,
    programRoutines,
    personalRecords,
    bodyMeasurements,
    dprBlocks,
    dprBlockLifts,
    gyms,
    injuries,
    painCheckins,
    settings,
  });
}
