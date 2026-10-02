import type { Mutation } from "@jim/core";
import type {
  bodyMeasurements,
  dprBlockLifts,
  dprBlocks,
  exercises,
  personalRecords,
  programRoutines,
  programs,
  routineExercises,
  routines,
  sessionExercises,
  sessions,
  sets,
  users,
} from "@jim/db";
import Dexie, { type EntityTable } from "dexie";
import { bootQueryMiddleware } from "../boot/dexie-boot-middleware";

// Dexie mirrors Postgres (docs/ARCHITECTURE.md §1) — row shapes come
// straight from the Drizzle schema (type-only import: nothing server-side
// ships to the browser) rather than being hand-duplicated and drifting.
export type RoutineRow = typeof routines.$inferSelect;
export type RoutineExerciseRow = typeof routineExercises.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SessionExerciseRow = typeof sessionExercises.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type PersonalRecordRow = typeof personalRecords.$inferSelect;
export type BodyMeasurementRow = typeof bodyMeasurements.$inferSelect;
export type ExerciseRow = typeof exercises.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type ProgramRoutineRow = typeof programRoutines.$inferSelect;
export type DprBlockRow = typeof dprBlocks.$inferSelect;
export type DprBlockLiftRow = typeof dprBlockLifts.$inferSelect;

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
}

/** A pending outbox entry — its id (a UUIDv7) doubles as the FIFO drain order. */
export type OutboxEntry = Mutation;

/** Singleton row: sync cursor + this install's stable device id. */
export interface SyncMetaRow {
  id: "meta";
  cursor: number;
  deviceId: string;
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
  | "colorScheme"
  | "accentColor"
  | "fontFamily"
  | "cardStyle"
  | "showPaceTracker"
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
