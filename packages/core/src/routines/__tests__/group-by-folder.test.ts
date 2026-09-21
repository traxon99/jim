import { describe, expect, it } from "vitest";
import { groupRoutinesByFolder } from "../group-by-folder";

interface TestRoutine {
  id: string;
  folder: string | null;
  position: number;
}

describe("groupRoutinesByFolder", () => {
  it("groups routines under their folder", () => {
    const routines: TestRoutine[] = [
      { id: "a", folder: "Push/Pull/Legs", position: 0 },
      { id: "b", folder: "Push/Pull/Legs", position: 1 },
      { id: "c", folder: "Upper/Lower", position: 0 },
    ];

    const groups = groupRoutinesByFolder(routines);

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.folder === "Push/Pull/Legs")?.routines.map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("sorts ungrouped routines (folder: null) first", () => {
    const routines: TestRoutine[] = [
      { id: "a", folder: "Zzz", position: 0 },
      { id: "b", folder: null, position: 0 },
    ];

    const groups = groupRoutinesByFolder(routines);

    expect(groups[0]?.folder).toBeNull();
    expect(groups[1]?.folder).toBe("Zzz");
  });

  it("sorts named folders alphabetically", () => {
    const routines: TestRoutine[] = [
      { id: "a", folder: "Zzz", position: 0 },
      { id: "b", folder: "Aaa", position: 0 },
    ];

    const groups = groupRoutinesByFolder(routines);

    expect(groups.map((g) => g.folder)).toEqual(["Aaa", "Zzz"]);
  });

  it("orders routines within a folder by position", () => {
    const routines: TestRoutine[] = [
      { id: "second", folder: "F", position: 1 },
      { id: "first", folder: "F", position: 0 },
    ];

    const groups = groupRoutinesByFolder(routines);

    expect(groups[0]?.routines.map((r) => r.id)).toEqual(["first", "second"]);
  });

  it("returns an empty array for no routines", () => {
    expect(groupRoutinesByFolder([])).toEqual([]);
  });
});
