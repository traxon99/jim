import { describe, expect, it } from "vitest";
import { libraryFolders, splitWarmups } from "../library";

let nextPosition = 0;

function routine(
  id: string,
  overrides: Partial<{
    name: string;
    folder: string | null;
    kind: "strength" | "warmup";
    warmupRoutineId: string | null;
    deletedAt: Date | null;
  }> = {},
) {
  return {
    id,
    name: overrides.name ?? id,
    folder: overrides.folder ?? null,
    position: nextPosition++,
    kind: overrides.kind ?? "strength",
    warmupRoutineId: overrides.warmupRoutineId ?? null,
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe("libraryFolders", () => {
  it("lists folders first and the unfoldered routines last, leaving out the program's", () => {
    const routines = [
      routine("loose"),
      routine("push", { folder: "Split" }),
      routine("upper", { folder: "Split" }),
      routine("abs", { folder: "Split" }),
      routine("warm", { kind: "warmup" }),
      routine("gone", { deletedAt: new Date() }),
    ];
    const groups = libraryFolders(routines, new Set(["push"]));
    expect(groups.map((group) => group.folder)).toEqual(["Split", null]);
    expect(groups[0]?.routines.map((r) => r.id)).toEqual(["upper", "abs"]);
    expect(groups[1]?.routines.map((r) => r.id)).toEqual(["loose"]);
  });

  it("drops a folder whose routines are all in the program", () => {
    const groups = libraryFolders([routine("push", { folder: "Split" })], new Set(["push"]));
    expect(groups).toEqual([]);
  });
});

describe("splitWarmups", () => {
  it("splits warm-ups by whether a routine runs them, and flags same-name copies", () => {
    const routines = [
      routine("w1", { kind: "warmup", name: "Legs Warm Up" }),
      routine("w2", { kind: "warmup", name: "legs warm up " }),
      routine("w3", { kind: "warmup", name: "Full-body" }),
      routine("legs", { name: "Legs", warmupRoutineId: "w1" }),
      routine("lower", { name: "Lower", warmupRoutineId: "w1" }),
      routine("old", { name: "Old", warmupRoutineId: "w3", deletedAt: new Date() }),
    ];
    const { linked, unlinked, duplicateNames } = splitWarmups(routines);
    expect(linked.map((entry) => entry.warmup.id)).toEqual(["w1"]);
    expect(linked[0]?.usedBy).toEqual(["Legs", "Lower"]);
    expect(linked[0]?.duplicate).toBe(true);
    expect(unlinked.map((entry) => [entry.warmup.id, entry.duplicate])).toEqual([
      ["w3", false],
      ["w2", true],
    ]);
    expect(duplicateNames).toBe(1);
  });
});
