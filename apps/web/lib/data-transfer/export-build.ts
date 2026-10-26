import type {
  BodyMeasurementRow,
  DprBlockLiftRow,
  DprBlockRow,
  ExerciseRow,
  GymRow,
  InjuryRow,
  PainCheckinRow,
  PersonalRecordRow,
  ProgramRoutineRow,
  ProgramRow,
  RoutineExerciseRow,
  RoutineRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
  SettingsRow,
} from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import {
  type ExportWorkout,
  type WeightUnit,
  deletedSessionExerciseIds,
  resolveCurrentRows,
  toStrongCsv,
  toWeightCsv,
  withoutDeletedSessionRecords,
} from "@jim/core";

/**
 * The export files (issues #242, #470), built from rows alone: the phone
 * reads them out of IndexedDB (`export.ts`), desktop Analysis from
 * Postgres. Supersede chains and tombstones are resolved first, so the
 * files hold what the app shows: no deleted workouts, no removed
 * exercises, only each set's latest version. No IndexedDB import here.
 */

export interface HistoryTables {
  sessions: readonly SessionRow[];
  sessionExercises: readonly SessionExerciseRow[];
  sets: readonly SetRow[];
  exercises: readonly ExerciseRow[];
}

/** Every table the full JSON export holds. */
export interface ExportTables extends HistoryTables {
  routines: readonly RoutineRow[];
  routineExercises: readonly RoutineExerciseRow[];
  programs: readonly ProgramRow[];
  programRoutines: readonly ProgramRoutineRow[];
  personalRecords: readonly PersonalRecordRow[];
  bodyMeasurements: readonly BodyMeasurementRow[];
  dprBlocks: readonly DprBlockRow[];
  dprBlockLifts: readonly DprBlockLiftRow[];
  gyms: readonly GymRow[];
  /** Injuries and their pain check-ins (issue #627); private, but the user's own. */
  injuries?: readonly InjuryRow[];
  painCheckins?: readonly PainCheckinRow[];
  settings: SettingsRow | undefined;
}

interface LiveHistory {
  /** Every raw row, for matching PRs to the sets they point at. */
  rawSets: readonly SetRow[];
  deletedSessionExercises: Set<string>;
  sessions: SessionRow[];
  sessionExercises: SessionExerciseRow[];
  sets: SetRow[];
  exercises: readonly ExerciseRow[];
}

function liveHistory(tables: HistoryTables): LiveHistory {
  const deleted = deletedSessionExerciseIds(tables.sessions, tables.sessionExercises);
  const sessions = tables.sessions
    .filter((session) => !session.deletedAt)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const sessionExercises = tables.sessionExercises.filter((se) => !deleted.has(se.id));
  const liveSessionExerciseIds = new Set(sessionExercises.map((se) => se.id));
  const sets = resolveCurrentRows(tables.sets).filter(
    (set) => !set.deletedAt && liveSessionExerciseIds.has(set.sessionExerciseId),
  );
  return {
    rawSets: tables.sets,
    deletedSessionExercises: deleted,
    sessions,
    sessionExercises,
    sets,
    exercises: tables.exercises,
  };
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
export function strongCsvFromTables(tables: HistoryTables): string {
  const { sessions, sessionExercises, sets, exercises } = liveHistory(tables);
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

/**
 * Every live weigh-in, oldest first, in Strong's measurement layout and the
 * unit it was logged in, so the bodyweight import reads it straight back.
 */
export function bodyweightCsvFromTables(tables: Pick<ExportTables, "bodyMeasurements">): string {
  return toWeightCsv(
    tables.bodyMeasurements
      .filter((row) => row.kind === "bodyweight" && !row.deletedAt)
      .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())
      .map((row) => ({
        measuredAt: row.measuredAt,
        value: Number(row.value),
        unit: row.unit as WeightUnit,
      })),
  );
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
 * custom exercises, PRs, bodyweight, DPR blocks, gyms, injuries and settings (DPR
 * config included).
 */
export function jsonExportFromTables(tables: ExportTables, now: Date = new Date()): string {
  const history = liveHistory(tables);
  const {
    routines,
    routineExercises,
    programs,
    programRoutines,
    personalRecords,
    bodyMeasurements,
    dprBlocks,
    dprBlockLifts,
    gyms,
    injuries = [],
    painCheckins = [],
    settings,
  } = tables;
  const exerciseName = new Map(history.exercises.map((exercise) => [exercise.id, exercise.name]));
  const liveRoutineIds = new Set(routines.filter((r) => !r.deletedAt).map((r) => r.id));
  const liveProgramIds = new Set(programs.filter((p) => !p.deletedAt).map((p) => p.id));
  const liveBlockIds = new Set(dprBlocks.filter((b) => !b.deletedAt).map((b) => b.id));
  const { id: _settingsId, ...userSettings } = settings ?? DEFAULT_SETTINGS;

  const data = {
    app: "jim",
    version: JSON_EXPORT_VERSION,
    exportedAt: now.toISOString(),
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
    gyms: live(gyms),
    injuries: live(injuries),
    painCheckins: live(painCheckins),
  };
  return JSON.stringify(data, null, 2);
}

/** `jim-export-2026-09-28.csv`, or `jim-bodyweight-2026-09-28.csv` with a name. */
export function exportFileName(
  extension: "csv" | "json",
  now: Date = new Date(),
  name = "export",
): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return `jim-${name}-${date}.${extension}`;
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
  downloadFile(file);
}

/** A plain browser download, as desktop Analysis uses (issue #470). */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
