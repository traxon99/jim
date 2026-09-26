import type { JimDatabase, SettingsRow } from "@/lib/db/schema";
import { type DprSnapshot, type RepRange, buildDprSnapshot } from "@jim/core";

export { buildDprSnapshot, e1rmSeries, toDprSet } from "@jim/core";
export type { DprSnapshot, DprSourceRows } from "@jim/core";

export function defaultRepRange(
  settings: Pick<SettingsRow, "dprDefaultRepLow" | "dprDefaultRepHigh">,
): RepRange {
  return { low: settings.dprDefaultRepLow, high: settings.dprDefaultRepHigh };
}

/** Reads everything DPR derives from out of Dexie in one pass. */
export async function loadDprSnapshot(
  database: JimDatabase,
  defaultRange: RepRange,
): Promise<DprSnapshot> {
  const [sessions, sessionExercises, sets, routines, routineExercises] = await Promise.all([
    database.sessions.toArray(),
    database.sessionExercises.toArray(),
    database.sets.toArray(),
    database.routines.toArray(),
    database.routineExercises.toArray(),
  ]);
  return buildDprSnapshot(
    { sessions, sessionExercises, sets, routines, routineExercises },
    defaultRange,
  );
}
