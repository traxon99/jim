import { CURATED_EXERCISES } from "@jim/core";
import { describe, expect, it } from "vitest";
import { curatedSeedRows } from "../curated";
import { CONTROLLED_MUSCLES } from "../muscles";

describe("curatedSeedRows", () => {
  it("emits one global strength row per curated entry, all within the muscle vocabulary", () => {
    const rows = curatedSeedRows();
    expect(rows).toHaveLength(CURATED_EXERCISES.length);
    for (const row of rows) {
      expect(row.ownerId).toBeNull();
      expect(row.category).toBe("strength");
      expect(row.slug.startsWith("curated-")).toBe(true);
      for (const m of [...(row.primaryMuscles ?? []), ...(row.secondaryMuscles ?? [])]) {
        expect(CONTROLLED_MUSCLES.has(m)).toBe(true);
      }
    }
  });
});
