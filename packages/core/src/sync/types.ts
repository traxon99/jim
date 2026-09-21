// Every table the sync engine moves between Dexie and Postgres (see
// docs/ARCHITECTURE.md §3-4). `exercises` is deliberately excluded: it's
// pulled read-only (the seed catalog) and never pushed via the outbox.
export const SYNC_TABLES = [
  "routines",
  "routineExercises",
  "sessions",
  "sessionExercises",
  "sets",
  "personalRecords",
  "bodyMeasurements",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

// Sets are append-only and immutable (ADR-003); every other table is
// last-write-wins, tie-broken on (updatedAt, deviceId).
export const APPEND_ONLY_TABLES: ReadonlySet<SyncTable> = new Set(["sets"]);

export interface SupersedableRow {
  id: string;
  supersedesId: string | null;
}

export interface LwwRow {
  id: string;
  updatedAt: Date;
  deviceId: string;
}

/** One outbox entry: a full-row upsert against one table, keyed by a client-generated id for push idempotency. */
export interface Mutation {
  id: string;
  table: SyncTable;
  entity: Record<string, unknown>;
}
