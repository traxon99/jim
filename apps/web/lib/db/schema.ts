import type { Mutation } from "@jim/core";
import type {
  bodyMeasurements,
  dprBlockLifts,
  dprBlocks,
  exercisePreferences,
  exercises,
  gyms,
  injuries,
  painCheckins,
  personalRecords,
  programRoutines,
  programs,
  progressPhotos,
  routineExercises,
  routines,
  sessionExercises,
  sessions,
  sets,
  sickDays,
  users,
} from "@jim/db";
import Dexie, { type EntityTable } from "dexie";
import { bootQueryMiddleware } from "../boot/dexie-boot-middleware";

// Dexie mirrors Postgres (docs/ARCHITECTURE.md §1) — row shapes come
// straight from the Drizzle schema (type-only import: nothing server-side
// ships to the browser) rather than being hand-duplicated and drifting.
export type RoutineRow = typeof routines.$inferSelect;
type RoutineExerciseSelect = typeof routineExercises.$inferSelect;
/** Tempo (issue #845) is optional: rows cached before the column existed don't carry it. */
export type RoutineExerciseRow = Omit<RoutineExerciseSelect, "tempo"> &
  Partial<Pick<RoutineExerciseSelect, "tempo">>;
type SessionSelect = typeof sessions.$inferSelect;
/**
 * The session's gym (issue #454) and Strava choice (issue #836) are optional
 * here, like an exercise's machine details: rows cached before the columns
 * existed don't carry them.
 */
type SessionOptionalFields = "gymId" | "stravaPost";
export type SessionRow = Omit<SessionSelect, SessionOptionalFields> &
  Partial<Pick<SessionSelect, SessionOptionalFields>>;
type SessionExerciseSelect = typeof sessionExercises.$inferSelect;
/**
 * The set plan's edits (issue #803) and the tempo (issue #845) are optional
 * here, like an exercise's machine details: rows cached before the columns
 * existed don't carry them.
 */
type SessionExercisePlanFields = "addedSets" | "skippedSetIndices" | "tempo";
export type SessionExerciseRow = Omit<SessionExerciseSelect, SessionExercisePlanFields> &
  Partial<Pick<SessionExerciseSelect, SessionExercisePlanFields>>;
export type SetRow = typeof sets.$inferSelect;
export type PersonalRecordRow = typeof personalRecords.$inferSelect;
export type BodyMeasurementRow = typeof bodyMeasurements.$inferSelect;
type ExerciseSelect = typeof exercises.$inferSelect;
/**
 * Machine details (issue #450) are optional here: rows cached before those
 * columns existed don't carry them until they next sync, and every reader
 * treats a missing value as unset.
 */
type ExerciseMachineFields = "machineBrand" | "machineModel" | "pulleyType" | "gymId";
export type ExerciseRow = Omit<ExerciseSelect, ExerciseMachineFields> &
  Partial<Pick<ExerciseSelect, ExerciseMachineFields>>;
export type ProgramRow = typeof programs.$inferSelect;
export type ProgramRoutineRow = typeof programRoutines.$inferSelect;
export type DprBlockRow = typeof dprBlocks.$inferSelect;
export type DprBlockLiftRow = typeof dprBlockLifts.$inferSelect;
type GymSelect = typeof gyms.$inferSelect;
/**
 * A gym's coordinates (issue #462) are optional here, like an exercise's
 * machine details: rows cached before the columns existed don't carry them.
 */
export type GymRow = Omit<GymSelect, "latitude" | "longitude"> &
  Partial<Pick<GymSelect, "latitude" | "longitude">>;

export type InjuryRow = typeof injuries.$inferSelect;
export type PainCheckinRow = typeof painCheckins.$inferSelect;
export type SickDayRow = typeof sickDays.$inferSelect;
export type ExercisePreferenceRow = typeof exercisePreferences.$inferSelect;
export type ProgressPhotoRow = typeof progressPhotos.$inferSelect;

/**
 * A photo's bytes waiting to reach Storage (issue #835). Blobs don't belong in
 * the mutation outbox, so they queue here by photo id and are drained on the
 * same foreground triggers as sync. `thumbDone`/`originalDone` record which
 * object already landed, so a retry after a partial failure resumes instead
 * of uploading twice. Removed once both objects are stored.
 */
export interface PhotoUploadRow {
  photoId: string;
  thumb: Blob;
  original: Blob;
  thumbDone: boolean;
  originalDone: boolean;
  /** Failed attempts since the last success; a photo past the cap reads as a sync error. */
  failures: number;
  createdAt: Date;
}

/** A photo's thumbnail, cached on this phone so the grid works offline. */
export interface PhotoThumbRow {
  id: string;
  blob: Blob;
  cachedAt: Date;
}

export interface SyncTableRowMap {
  routines: RoutineRow;
  routineExercises: RoutineExerciseRow;
  sessions: SessionRow;
  sessionExercises: SessionExerciseRow;
  sets: SetRow;
  personalRecords: PersonalRecordRow;
  bodyMeasurements: BodyMeasurementRow;
  exercises: ExerciseRow;
  programs: ProgramRow;
  programRoutines: ProgramRoutineRow;
  dprBlocks: DprBlockRow;
  dprBlockLifts: DprBlockLiftRow;
  gyms: GymRow;
  injuries: InjuryRow;
  painCheckins: PainCheckinRow;
  sickDays: SickDayRow;
  exercisePreferences: ExercisePreferenceRow;
  progressPhotos: ProgressPhotoRow;
}

/** A pending outbox entry — its id (a UUIDv7) doubles as the FIFO drain order. */
/**
 * `failures` counts pushes the server answered with "error" for this
 * mutation (issue #500), so one that keeps failing shows as a sync error
 * rather than sitting "pending" forever. It's never sent to the server.
 */
export type OutboxEntry = Mutation & { failures?: number };

/** Singleton row: sync cursor + this install's stable device id. */
export interface SyncMetaRow {
  id: "meta";
  cursor: number;
  deviceId: string;
  /**
   * The Dexie schema version the cursor was earned under (issue #501). A
   * pull skips tables this version doesn't store yet, so after an upgrade
   * adds one the cursor starts over to fetch that table's existing rows.
   */
  schemaVersion?: number;
}

/**
 * A local cache of the user's settings row (units, bar weight, available
 * plates, rest timer default) — read by S6's plate math and rest timer.
 * Deliberately not an outbox/sync table: there's exactly one row, editing
 * it is a rare, low-stakes action (unlike logging a set), and going through
 * `/api/settings` directly keeps push/pull/apply-mutation untouched. The
 * cached copy is what makes logging itself still work with no network.
 */
export type SettingsRow = Pick<
  typeof users.$inferSelect,
  | "units"
  | "defaultBarWeight"
  | "availablePlates"
  | "defaultRestSeconds"
  | "weekStart"
  | "weeklyWorkoutGoal"
  | "colorScheme"
  | "accentColor"
  | "fontFamily"
  | "cardStyle"
  | "showPaceTracker"
  | "advancedFeatures"
  | "showRpe"
  | "showStrengthHints"
  | "showSetTypes"
  | "showRestStats"
  | "showSetTimer"
  | "showTempo"
  | "showInjuryRules"
  | "injuriesAffectPrp"
  | "showInjuryHints"
  | "autoEndWorkoutMinutes"
  | "pushRestTimer"
  | "pushWorkoutReminders"
  | "pushWhatsNew"
  | "pushWhatsNewEveryDeploy"
  | "sex"
  | "birthdate"
  | "heightCm"
  | "bodyweight"
  | "dprEnabled"
  | "dprAggressiveness"
  | "dprExperience"
  | "dprEquipmentIncrements"
  | "dprDefaultRepLow"
  | "dprDefaultRepHigh"
  | "dprPromptDismissedAt"
  | "onboardedAt"
> & { id: "me" };

export class JimDatabase extends Dexie {
  routines!: EntityTable<RoutineRow, "id">;
  routineExercises!: EntityTable<RoutineExerciseRow, "id">;
  sessions!: EntityTable<SessionRow, "id">;
  sessionExercises!: EntityTable<SessionExerciseRow, "id">;
  sets!: EntityTable<SetRow, "id">;
  personalRecords!: EntityTable<PersonalRecordRow, "id">;
  bodyMeasurements!: EntityTable<BodyMeasurementRow, "id">;
  exercises!: EntityTable<ExerciseRow, "id">;
  programs!: EntityTable<ProgramRow, "id">;
  programRoutines!: EntityTable<ProgramRoutineRow, "id">;
  dprBlocks!: EntityTable<DprBlockRow, "id">;
  dprBlockLifts!: EntityTable<DprBlockLiftRow, "id">;
  gyms!: EntityTable<GymRow, "id">;
  injuries!: EntityTable<InjuryRow, "id">;
  painCheckins!: EntityTable<PainCheckinRow, "id">;
  sickDays!: EntityTable<SickDayRow, "id">;
  exercisePreferences!: EntityTable<ExercisePreferenceRow, "id">;
  progressPhotos!: EntityTable<ProgressPhotoRow, "id">;
  photoUploads!: EntityTable<PhotoUploadRow, "photoId">;
  photoThumbs!: EntityTable<PhotoThumbRow, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  syncMeta!: EntityTable<SyncMetaRow, "id">;
  settings!: EntityTable<SettingsRow, "id">;

  constructor(name = "jim") {
    super(name);
    this.version(1).stores({
      routines: "id, updatedAt, deletedAt",
      routineExercises: "id, routineId, exerciseId",
      sessions: "id, updatedAt, deletedAt",
      sessionExercises: "id, sessionId, exerciseId",
      sets: "id, sessionExerciseId, supersedesId",
      personalRecords: "id, exerciseId",
      bodyMeasurements: "id",
      exercises: "id, slug, ownerId",
      outbox: "id",
      syncMeta: "id",
      settings: "id",
    });
    this.version(2).stores({
      programs: "id, updatedAt, deletedAt",
      programRoutines: "id, programId, routineId",
    });
    this.version(3).stores({
      dprBlocks: "id, status, updatedAt, deletedAt",
      dprBlockLifts: "id, blockId, exerciseId",
    });
    this.version(4).stores({
      gyms: "id, updatedAt, deletedAt",
    });
    // Injuries and their daily pain check-ins (issue #627).
    this.version(5).stores({
      injuries: "id, updatedAt, deletedAt",
      painCheckins: "id, injuryId, day",
    });
    // Sick days (issue #779).
    this.version(6).stores({
      sickDays: "id, day",
    });
    // Exercise preferences (issue #795).
    this.version(7).stores({
      exercisePreferences: "id, exerciseSlug",
    });
    // Progress photos (issue #835): the synced metadata, the blob upload
    // queue, and the thumbnail cache. The queue and cache are device-local.
    this.version(8).stores({
      progressPhotos: "id, takenOn, updatedAt, deletedAt",
      photoUploads: "photoId, createdAt",
      photoThumbs: "id",
    });
  }
}

export const db = new JimDatabase();
// Holds the boot splash while any IndexedDB query is in flight (the app's db
// only, not the isolated test instances below).
db.use(bootQueryMiddleware);

/** For tests: an isolated instance so parallel test files don't share IndexedDB state. */
export function createTestDb(name: string) {
  return new JimDatabase(name);
}
