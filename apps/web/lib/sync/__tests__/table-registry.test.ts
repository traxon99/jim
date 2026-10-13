import { SYNC_DATE_FIELDS, SYNC_TABLES } from "@jim/core";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../../db/schema";
import { LWW_TABLES } from "../apply-mutation";

// Push, pull and Dexie each list the synced tables; these checks keep them
// in step (issue #554). Pull and push coverage is enforced by their
// `Record<SyncTable, …>` types; what types can't see is checked here.
describe("sync table registry", () => {
  it("has a Dexie table and date fields for every synced table", () => {
    const database = createTestDb(`jim-registry-${crypto.randomUUID()}`);
    const dexieTables = new Set(database.tables.map((table) => table.name));
    for (const name of SYNC_TABLES) {
      expect(dexieTables.has(name), name).toBe(true);
      expect(SYNC_DATE_FIELDS[name], name).toBeDefined();
    }
  });

  it("names only real columns in each push upsert", () => {
    for (const [name, { table, updatable, owner }] of Object.entries(LWW_TABLES)) {
      const columns = table as unknown as Record<string, unknown>;
      for (const key of [...updatable, owner ?? "userId", "id", "updatedAt", "deviceId"]) {
        expect(columns[key], `${name}.${key}`).toBeDefined();
      }
    }
  });
});
