// Every table the sync engine moves between Dexie and Postgres (see
// docs/ARCHITECTURE.md §3-4). `exercises` pushes too as of S4 (custom and
// cloned rows, ADR-008) — RLS's owner_id = auth.uid() check on insert/update
// means a push can never touch a global seed row (owner_id IS NULL) no
// matter what a client sends.
export const SYNC_TABLES = [
  "routines",
  "routineExercises",
  "sessions",
  "sessionExercises",
  "sets",
  "personalRecords",
  "bodyMeasurements",
  "exercises",
  "programs",
  "programRoutines",
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
