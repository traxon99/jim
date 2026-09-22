import type { SyncTable } from "./types";

/**
 * Which fields on each table's row are timestamps — shared by the push
 * route (rehydrating JSON's ISO strings into Dates before writing to
 * Postgres) and the client's pull application (same rehydration, before
 * writing to Dexie). Keeping one list means the two can't drift apart.
 */
export const SYNC_DATE_FIELDS: Record<SyncTable, readonly string[]> = {
  routines: ["createdAt", "updatedAt", "deletedAt"],
  routineExercises: ["updatedAt", "deletedAt"],
  sessions: ["startedAt", "endedAt", "updatedAt", "deletedAt"],
  sessionExercises: ["updatedAt", "deletedAt"],
  sets: ["completedAt", "deletedAt"],
  personalRecords: ["achievedAt", "updatedAt", "deletedAt"],
  bodyMeasurements: ["measuredAt", "updatedAt", "deletedAt"],
  exercises: ["createdAt", "updatedAt"],
  programs: ["createdAt", "updatedAt", "deletedAt"],
  programRoutines: ["updatedAt", "deletedAt"],
};

/** Converts a row's known date fields from ISO strings (JSON's wire format) to Date objects. Leaves null/undefined alone. */
export function normalizeDates<T extends Record<string, unknown>>(
  entity: T,
  keys: readonly string[],
): T {
  const result = { ...entity };
  for (const key of keys) {
    const value = result[key];
    if (typeof value === "string") {
      (result as Record<string, unknown>)[key] = new Date(value);
    }
  }
  return result;
}
