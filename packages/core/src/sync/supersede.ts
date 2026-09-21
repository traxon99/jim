import type { SupersedableRow } from "./types";

/**
 * Resolves the current row for each logical entity in a supersede chain
 * (ADR-003): editing a set inserts a new row carrying `supersedesId` rather
 * than updating the old one, so a row is current iff no other row's
 * `supersedesId` points at it.
 *
 * Doesn't filter tombstones (`deletedAt`) — a caller deciding whether a
 * deleted entity should still render is a different concern from finding
 * which row is authoritative for it.
 */
export function resolveCurrentRows<T extends SupersedableRow>(rows: readonly T[]): T[] {
  const superseded = new Set<string>();
  for (const row of rows) {
    if (row.supersedesId) superseded.add(row.supersedesId);
  }
  return rows.filter((row) => !superseded.has(row.id));
}
