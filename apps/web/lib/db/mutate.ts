import { uuidv7 } from "@jim/core";
import type { EntityTable } from "dexie";
import { type JimDatabase, type SyncTableRowMap, db } from "./schema";

/**
 * Writes an entity and its outbox entry in one Dexie transaction — the two
 * are never allowed to happen without each other (docs/ARCHITECTURE.md §1),
 * so a mutation can never be visible locally without also being queued to
 * reach Postgres, or vice versa.
 */
export async function mutate<K extends keyof SyncTableRowMap>(
  table: K,
  entity: SyncTableRowMap[K],
  database: JimDatabase = db,
): Promise<void> {
  const entityTable = database[table] as unknown as EntityTable<SyncTableRowMap[K], "id">;
  const mutationId = uuidv7();

  await database.transaction("rw", entityTable, database.outbox, async () => {
    await entityTable.put(entity);
    await database.outbox.put({ id: mutationId, table, entity });
  });
}
