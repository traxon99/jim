import type { Mutation } from "@jim/core";
import type {
  bodyMeasurements,
  exercises,
  personalRecords,
  routineExercises,
  routines,
  sessionExercises,
  sessions,
  sets,
} from "@jim/db";
import Dexie, { type EntityTable } from "dexie";

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

export interface SyncTableRowMap {
  routines: RoutineRow;
  routineExercises: RoutineExerciseRow;
  sessions: SessionRow;
  sessionExercises: SessionExerciseRow;
  sets: SetRow;
  personalRecords: PersonalRecordRow;
  bodyMeasurements: BodyMeasurementRow;
  exercises: ExerciseRow;
}

/** A pending outbox entry — its id (a UUIDv7) doubles as the FIFO drain order. */
export type OutboxEntry = Mutation;

/** Singleton row: sync cursor + this install's stable device id. */
export interface SyncMetaRow {
  id: "meta";
  cursor: number;
  deviceId: string;
}

export class JimDatabase extends Dexie {
  routines!: EntityTable<RoutineRow, "id">;
  routineExercises!: EntityTable<RoutineExerciseRow, "id">;
  sessions!: EntityTable<SessionRow, "id">;
  sessionExercises!: EntityTable<SessionExerciseRow, "id">;
  sets!: EntityTable<SetRow, "id">;
  personalRecords!: EntityTable<PersonalRecordRow, "id">;
  bodyMeasurements!: EntityTable<BodyMeasurementRow, "id">;
  exercises!: EntityTable<ExerciseRow, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  syncMeta!: EntityTable<SyncMetaRow, "id">;

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
    });
  }
}

export const db = new JimDatabase();

/** For tests: an isolated instance so parallel test files don't share IndexedDB state. */
export function createTestDb(name: string) {
  return new JimDatabase(name);
}
