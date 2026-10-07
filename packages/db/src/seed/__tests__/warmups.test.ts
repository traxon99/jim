import { WARMUP_EXERCISES } from "@jim/core";
import { describe, expect, it } from "vitest";
import { CONTROLLED_MUSCLES } from "../muscles";
import { classifyCategory, warmupSeedRows } from "../warmups";

describe("classifyCategory", () => {
  it("puts stretching in warm-ups, cardio in cardio and everything else in strength", () => {
    expect(classifyCategory({ category: "stretching" })).toBe("warmup");
    expect(classifyCategory({ category: "cardio" })).toBe("cardio");
    expect(classifyCategory({ category: "strength" })).toBe("strength");
    expect(classifyCategory({ category: null })).toBe("strength");
  });
});

describe("warmupSeedRows", () => {
  it("emits one global warm-up row per curated entry, all within the muscle vocabulary", () => {
    const rows = warmupSeedRows();
    expect(rows).toHaveLength(WARMUP_EXERCISES.length);
    for (const row of rows) {
      expect(row.ownerId).toBeNull();
      expect(row.category).toBe("warmup");
      for (const m of [...(row.primaryMuscles ?? []), ...(row.secondaryMuscles ?? [])]) {
        expect(CONTROLLED_MUSCLES.has(m)).toBe(true);
      }
    }
  });
});
