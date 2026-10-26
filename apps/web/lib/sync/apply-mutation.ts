import { type Mutation, SYNC_DATE_FIELDS, type SyncTable, normalizeDates } from "@jim/core";
import {
  type DbOrTx,
  bodyMeasurements,
  dprBlockLifts,
  dprBlocks,
  exercises,
  gyms,
  injuries,
  painCheckins,
  personalRecords,
  programRoutines,
  programs,
  routineExercises,
  routines,
  sessionExercises,
  sessions,
  sets,
  syncMutations,
} from "@jim/db";
import { type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { excluded } from "./excluded";

/**
 * "stale": the mutation lost last-write-wins to a newer server row, so
 * nothing was written; the client drops it, and the next pull brings the
 * winning row back (issue #490).
 */
export type ApplyResult = "applied" | "duplicate" | "stale" | "error";

interface LwwTable {
  table: PgTable;
  /** Columns an edit may change, by Drizzle property name. */
  updatable: readonly string[];
  /** The column forced to the pushing user; `userId` unless set. */
  owner?: string;
}

/** (updatedAt, deviceId) tie-break per ADR-003 — the SQL mirror of @jim/core's isNewerWrite. */
function lwwGuard(updatedAt: PgColumn, deviceId: PgColumn): SQL {
  return sql`(${excluded(updatedAt)}, ${excluded(deviceId)}) > (${updatedAt}, ${deviceId})`;
}

/**
 * Applies one outbox mutation inside its own SAVEPOINT (nested transaction),
 * so a bad mutation can't poison the rest of the push batch: Postgres aborts
 * an entire transaction after any single statement error, so without a
 * SAVEPOINT one failure would take down every mutation after it.
 *
 * The sync_mutations insert and the entity write happen in the same
 * SAVEPOINT, so "recorded as applied" and "actually applied" can never
 * diverge — a crash between the two just rolls both back.
 */
export async function applyMutation(
  tx: DbOrTx,
  userId: string,
  mutation: Mutation,
): Promise<ApplyResult> {
  try {
    return await tx.transaction(async (savepoint) => {
      const [ledgerRow] = await savepoint
        .insert(syncMutations)
        .values({ id: mutation.id, userId })
        .onConflictDoNothing()
        .returning({ id: syncMutations.id });

      if (!ledgerRow) {
        return "duplicate"; // a previous push already applied this mutation_id
      }

      return await applyEntity(savepoint, userId, mutation);
    });
  } catch (error) {
    console.error(`[sync/push] mutation ${mutation.id} (${mutation.table}) failed:`, error);
    return "error";
  }
}

/**
 * An upsert whose LWW guard rejected it returns no row. The server's copy
 * won, but its server_seq is older than the device's cursor, so a pull
 * would never send it back: give it a fresh seq so the losing device
 * receives the winning row and converges.
 */
async function settle(
  tx: DbOrTx,
  table: PgTable,
  id: unknown,
  written: readonly unknown[],
): Promise<"applied" | "stale"> {
  if (written.length > 0) return "applied";
  await tx.execute(sql`UPDATE ${table} SET server_seq = nextval('sync_seq') WHERE id = ${id}`);
  return "stale";
}

/**
 * Every last-write-wins table push accepts (issue #554), with the columns an
 * edit may change. Keyed by `SyncTable`, so a table added to SYNC_TABLES
 * without an entry here fails typecheck instead of being silently refused.
 * `updatedAt`, `deviceId`, `deletedAt` and a fresh `serverSeq` are always
 * in the update set. Columns left out are insert-only: `createdAt` (and a
 * session's `startedAt`) keep the time the row was really created offline,
 * not when it reached the server.
 */
export const LWW_TABLES: Record<Exclude<SyncTable, "sets">, LwwTable> = {
  routines: {
    table: routines,
    updatable: [
      "name",
      "notes",
      "position",
      "folder",
      "kind",
      "warmupRoutineId",
      "warmupMinutes",
      "iconShape",
      "iconColor",
    ],
  },
  routineExercises: {
    table: routineExercises,
    updatable: [
      "routineId",
      "exerciseId",
      "position",
      "supersetGroup",
      "targetSets",
      "targetRepsLow",
      "targetRepsHigh",
      "targetRestSeconds",
      "targetDurationSeconds",
      "targetWeight",
      "progressionRule",
      "notes",
    ],
  },
  sessions: {
    table: sessions,
    updatable: ["routineId", "name", "endedAt", "notes", "bodyweight", "intensity", "gymId"],
  },
  sessionExercises: {
    table: sessionExercises,
    updatable: [
      "sessionId",
      "exerciseId",
      "position",
      "supersetGroup",
      "notes",
      "stickyNote",
      "restSeconds",
      "warmupSets",
    ],
  },
  personalRecords: {
    table: personalRecords,
    updatable: ["exerciseId", "kind", "value", "setId", "achievedAt"],
  },
  bodyMeasurements: {
    table: bodyMeasurements,
    updatable: ["kind", "value", "unit", "measuredAt"],
  },
  // ownerId is forced to the verified user regardless of what the payload
  // carries. RLS's owner_id = auth.uid() check would reject a write to
  // anyone else's row (or a global one) anyway, but this keeps a mismatched
  // payload from reaching that check as a no-op-looking failure.
  exercises: {
    table: exercises,
    owner: "ownerId",
    updatable: [
      "slug",
      "name",
      "aliases",
      "primaryMuscles",
      "secondaryMuscles",
      "equipment",
      "mechanic",
      "force",
      "level",
      "trackingType",
      "category",
      "instructions",
      "imageUrls",
      "videoUrl",
      "machineBrand",
      "machineModel",
      "pulleyType",
      "gymId",
      "isArchived",
    ],
  },
  programs: {
    table: programs,
    updatable: ["name", "mode", "isActive", "notes", "position", "durationWeeks", "activatedAt"],
  },
  programRoutines: {
    table: programRoutines,
    updatable: ["programId", "routineId", "position", "weekday"],
  },
  dprBlocks: {
    table: dprBlocks,
    updatable: [
      "startedAt",
      "weeks",
      "endsAt",
      "status",
      "aggressiveness",
      "experience",
      "volumeMode",
      "programId",
    ],
  },
  dprBlockLifts: {
    table: dprBlockLifts,
    updatable: ["blockId", "exerciseId", "position", "baselineE1rm", "goalE1rm"],
  },
  gyms: {
    table: gyms,
    updatable: ["name", "address", "latitude", "longitude", "notes", "isDefault", "position"],
  },
  injuries: {
    table: injuries,
    updatable: ["area", "side", "startedOn", "healedOn", "note", "exerciseRules"],
  },
  painCheckins: {
    table: painCheckins,
    updatable: ["painLevel"],
  },
};

/** The update set for an LWW upsert: the table's editable columns plus the sync bookkeeping. */
function lwwUpdateSet(table: PgTable, updatable: readonly string[]): Record<string, SQL> {
  const columns = table as unknown as Record<string, PgColumn | undefined>;
  const set: Record<string, SQL> = {};
  for (const key of [...updatable, "updatedAt", "deviceId", "deletedAt"]) {
    const column = columns[key];
    if (column) set[key] = excluded(column);
  }
  set.serverSeq = sql`nextval('sync_seq')`;
  return set;
}

async function applyEntity(
  tx: DbOrTx,
  userId: string,
  mutation: Mutation,
): Promise<"applied" | "stale"> {
  const dated = normalizeDates(
    mutation.entity as Record<string, unknown>,
    SYNC_DATE_FIELDS[mutation.table],
  );
  const { serverSeq: _serverSeq, ...row } = dated;

  if (mutation.table === "sets") {
    // Append-only (ADR-003): no conflict handling, no update path at all.
    await tx.insert(sets).values({ ...(row as typeof sets.$inferInsert), userId });
    return "applied";
  }

  const { table, updatable, owner = "userId" } = LWW_TABLES[mutation.table];
  const columns = table as unknown as Record<string, PgColumn>;
  const { [owner]: _owner, ...fields } = row;
  const written = await tx
    .insert(table)
    .values({ ...fields, [owner]: userId })
    .onConflictDoUpdate({
      target: columns.id as PgColumn,
      set: lwwUpdateSet(table, updatable),
      setWhere: lwwGuard(columns.updatedAt as PgColumn, columns.deviceId as PgColumn),
    })
    .returning({ id: columns.id as PgColumn });
  return settle(tx, table, row.id, written);
}
