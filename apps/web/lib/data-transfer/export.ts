import {
  type ExerciseRow,
  type JimDatabase,
  type SessionExerciseRow,
  type SessionRow,
  type SetRow,
  db,
} from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import {
  type ExportWorkout,
  deletedSessionExerciseIds,
  resolveCurrentRows,
  toStrongCsv,
  withoutDeletedSessionRecords,
} from "@jim/core";

/**
 * Full data export (issue #242), read straight from IndexedDB so it works
 * offline. Supersede chains and tombstones are resolved first, so both
 * files hold what the app shows: no deleted workouts, no removed
 * exercises, only each set's latest version.
 */

interface LiveHistory {
  /** Every raw row, for matching PRs to the sets they point at. */
  rawSets: SetRow[];
  deletedSessionExercises: Set<string>;
  sessions: SessionRow[];
  sessionExercises: SessionExerciseRow[];
  sets: SetRow[];
  exercises: ExerciseRow[];
}

async function loadLiveHistory(database: JimDatabase): Promise<LiveHistory> {
  const [rawSessions, rawSessionExercises, rawSets, exercises] = await Promise.all([
    database.sessions.toArray(),
    database.sessionExercises.toArray(),
    database.sets.toArray(),
    database.exercises.toArray(),
  ]);
  const deleted = deletedSessionExerciseIds(rawSessions, rawSessionExercises);
  const sessions = rawSessions
    .filter((session) => !session.deletedAt)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const sessionExercises = rawSessionExercises.filter((se) => !deleted.has(se.id));
  const liveSessionExerciseIds = new Set(sessionExercises.map((se) => se.id));
  const sets = resolveCurrentRows(rawSets).filter(
    (set) => !set.deletedAt && liveSessionExerciseIds.has(set.sessionExerciseId),
  );
  return { rawSets, deletedSessionExercises: deleted, sessions, sessionExercises, sets, exercises };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

function bySetOrder(a: SetRow, b: SetRow): number {
  return a.setIndex - b.setIndex || a.completedAt.getTime() - b.completedAt.getTime();
}

const toNumber = (value: string | null) => (value == null ? null : Number(value));

/** Finished workouts in Strong's CSV layout, one row per set, weights in the user's units. */
export async function buildStrongCsvExport(database: JimDatabase = db): Promise<string> {
  const { sessions, sessionExercises, sets, exercises } = await loadLiveHistory(database);
  const exerciseName = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  const setsBySessionExercise = groupBy(sets, (set) => set.sessionExerciseId);
  const itemsBySession = groupBy(sessionExercises, (se) => se.sessionId);

  const workouts: ExportWorkout[] = sessions
    .filter((session) => session.endedAt)
    .map((session) => ({
      name: session.name,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      notes: session.notes,
      exercises: (itemsBySession.get(session.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          name: exerciseName.get(item.exerciseId) ?? "Unknown exercise",
          notes: item.notes,
          sets: (setsBySessionExercise.get(item.id) ?? []).sort(bySetOrder).map((set) => ({
            kind: set.kind,
            weight: toNumber(set.weight),
            reps: set.reps,
            durationSeconds: set.durationSeconds,
            distance: toNumber(set.distance),
            rpe: toNumber(set.rpe),
          })),
        }))
        .filter((exercise) => exercise.sets.length > 0),
    }))
    .filter((workout) => workout.exercises.length > 0);

  return toStrongCsv(workouts);
}

/** Sync bookkeeping — meaningless outside this app, so left out of the export. */
function withoutSyncFields<T extends object>(
  row: T,
): Omit<T, "serverSeq" | "deviceId" | "deletedAt"> {
  const {
    serverSeq: _seq,
    deviceId: _device,
    deletedAt: _deleted,
    ...rest
  } = row as T & {
    serverSeq?: unknown;
    deviceId?: unknown;
    deletedAt?: unknown;
  };
  return rest;
}

function live<T extends { deletedAt?: Date | null }>(rows: readonly T[]) {
  return rows.filter((row) => !row.deletedAt).map(withoutSyncFields);
}

const JSON_EXPORT_VERSION = 1;

/**
 * Everything the user owns: workouts (with each exercise's name alongside
 * its id, since catalog exercises aren't included), routines, programs,
 * custom exercises, PRs, bodyweight, DPR blocks and settings (DPR config
 * included).
 */
export async function buildJsonExport(database: JimDatabase = db): Promise<string> {
  const history = await loadLiveHistory(database);
  const [
    routines,
    routineExercises,
    programs,
    programRoutines,
    personalRecords,
    bodyMeasurements,
    dprBlocks,
    dprBlockLifts,
    settings,
  ] = await Promise.all([
    database.routines.toArray(),
    database.routineExercises.toArray(),
    database.programs.toArray(),
    database.programRoutines.toArray(),
    database.personalRecords.toArray(),
    database.bodyMeasurements.toArray(),
    database.dprBlocks.toArray(),
    database.dprBlockLifts.toArray(),
    database.settings.get("me"),
  ]);
  const exerciseName = new Map(history.exercises.map((exercise) => [exercise.id, exercise.name]));
  const liveRoutineIds = new Set(routines.filter((r) => !r.deletedAt).map((r) => r.id));
  const liveProgramIds = new Set(programs.filter((p) => !p.deletedAt).map((p) => p.id));
  const liveBlockIds = new Set(dprBlocks.filter((b) => !b.deletedAt).map((b) => b.id));
  const { id: _settingsId, ...userSettings } = settings ?? DEFAULT_SETTINGS;

  const data = {
    app: "jim",
    version: JSON_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: userSettings,
    sessions: history.sessions.map(withoutSyncFields),
    sessionExercises: history.sessionExercises.map((item) => ({
      ...withoutSyncFields(item),
      exerciseName: exerciseName.get(item.exerciseId) ?? null,
    })),
    sets: history.sets.map(({ supersedesId: _supersedes, ...set }) => withoutSyncFields(set)),
    personalRecords: withoutDeletedSessionRecords(
      personalRecords.filter((record) => !record.deletedAt),
      history.rawSets,
      history.deletedSessionExercises,
    ).map(withoutSyncFields),
    routines: live(routines),
    routineExercises: live(routineExercises.filter((item) => liveRoutineIds.has(item.routineId))),
    programs: live(programs),
    programRoutines: live(programRoutines.filter((item) => liveProgramIds.has(item.programId))),
    customExercises: history.exercises
      .filter((exercise) => exercise.ownerId !== null)
      .map(withoutSyncFields),
    bodyMeasurements: live(bodyMeasurements),
    dprBlocks: live(dprBlocks),
    dprBlockLifts: live(dprBlockLifts.filter((lift) => liveBlockIds.has(lift.blockId))),
  };
  return JSON.stringify(data, null, 2);
}

/** `jim-export-2026-09-28.csv` */
export function exportFileName(extension: "csv" | "json", now: Date = new Date()): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return `jim-export-${date}.${extension}`;
}

/**
 * Hands the file to the user. The installed iOS app has no downloads
 * folder, so where the share sheet can take files it's used (its "Save to
 * Files" is the download); elsewhere a plain download link.
 */
export async function saveFile(contents: string, fileName: string, type: string): Promise<void> {
  const file = new File([contents], fileName, { type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Any other share failure falls through to a plain download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
