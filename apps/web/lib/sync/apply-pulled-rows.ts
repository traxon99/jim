import { SYNC_DATE_FIELDS, isNewerWrite, normalizeDates } from "@jim/core";
import type { EntityTable } from "dexie";
import type { JimDatabase } from "../db/schema";

// "sets" is append-only (no local conflict possible) and "exercises" is a
// server-authoritative read-only mirror — both are safe to just overwrite.
// Everything else is last-write-wins: only replace what's local if the
// pulled row is actually newer (ADR-003).
const OVERWRITE_TABLES = new Set(["sets", "exercises"]);

interface LwwLike {
  id: string;
  updatedAt: Date;
  deviceId: string;
}

/**
 * Applies one table's worth of pulled rows to Dexie. `tableName` comes from
 * the pull response's JSON keys, which are trusted to match a Dexie table
 * name (the server only ever emits the fixed set from `@jim/core`'s
 * SYNC_TABLES plus "exercises") — an unrecognised name is ignored rather
 * than thrown on, since a stale client tolerating a server-added table is
 * safer than crashing the sync loop over it.
 */
export async function applyPulledRows(
  database: JimDatabase,
  tableName: string,
  rows: readonly unknown[],
): Promise<void> {
  if (rows.length === 0) return;

  const dateFields = SYNC_DATE_FIELDS[tableName as keyof typeof SYNC_DATE_FIELDS];
  if (!dateFields) return;

  const table = (
    database as unknown as Record<string, EntityTable<{ id: string }, "id"> | undefined>
  )[tableName];
  if (!table) return;

  const normalized = rows.map((row) => normalizeDates(row as Record<string, unknown>, dateFields));

  if (OVERWRITE_TABLES.has(tableName)) {
    await table.bulkPut(normalized as { id: string }[]);
    return;
  }

  for (const row of normalized as unknown as LwwLike[]) {
    const existing = (await table.get(row.id)) as LwwLike | undefined;
    if (!existing || isNewerWrite(row, existing)) {
      await table.put(row);
    }
  }
}
