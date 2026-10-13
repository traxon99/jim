import type { SupersedableRow } from "./types";

/**
 * Resolves the current row for each logical entity in a supersede chain
 * (ADR-003): editing a set inserts a new row carrying `supersedesId` rather
 * than updating the old one, so a row is current iff no other row's
 * `supersedesId` points at it.
 *
 * Two devices editing the same set offline both supersede the same row, so
 * the chain forks and both tips look current (issue #531). Each entity is
 * the chain's first row; when it has several tips, only the newest id wins.
 * Ids are UUIDv7, so that's the edit made last (docs/ARCHITECTURE.md §3).
 *
 * Doesn't filter tombstones (`deletedAt`) — a caller deciding whether a
 * deleted entity should still render is a different concern from finding
 * which row is authoritative for it.
 */
export function resolveCurrentRows<T extends SupersedableRow>(rows: readonly T[]): T[] {
  const byId = new Map<string, T>();
  const superseded = new Set<string>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.supersedesId) superseded.add(row.supersedesId);
  }

  // The first row of a row's chain, or the id it supersedes when that row
  // isn't in `rows` (a partial load still groups the chain's tips together).
  const roots = new Map<string, string>();
  function rootOf(row: T): string {
    const path: string[] = [];
    let current: T | undefined = row;
    let root = row.id;
    while (current) {
      const known = roots.get(current.id);
      if (known) {
        root = known;
        break;
      }
      path.push(current.id);
      root = current.id;
      const parentId: string | null = current.supersedesId;
      if (!parentId || path.includes(parentId)) break;
      current = byId.get(parentId);
      if (!current) root = parentId;
    }
    for (const id of path) roots.set(id, root);
    return root;
  }

  const newestTip = new Map<string, string>();
  for (const row of rows) {
    if (superseded.has(row.id)) continue;
    const root = rootOf(row);
    const best = newestTip.get(root);
    if (best === undefined || row.id > best) newestTip.set(root, row.id);
  }
  const current = new Set(newestTip.values());
  return rows.filter((row) => current.has(row.id));
}
