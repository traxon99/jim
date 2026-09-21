import { describe, expect, it } from "vitest";
import { reorderRoutineExercises } from "../reorder";

interface TestItem {
  id: string;
  position: number;
}

function items(...ids: string[]): TestItem[] {
  return ids.map((id, position) => ({ id, position }));
}

describe("reorderRoutineExercises", () => {
  it("moves an item earlier in the list", () => {
    const result = reorderRoutineExercises(items("a", "b", "c"), "c", "a");
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("moves an item later in the list", () => {
    const result = reorderRoutineExercises(items("a", "b", "c"), "a", "c");
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("renumbers position to match the new order, contiguous from zero", () => {
    const result = reorderRoutineExercises(items("a", "b", "c"), "c", "a");
    expect(result.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("is a no-op when dropped onto itself", () => {
    const result = reorderRoutineExercises(items("a", "b", "c"), "b", "b");
    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by existing position first, independent of input array order", () => {
    const unordered: TestItem[] = [
      { id: "c", position: 2 },
      { id: "a", position: 0 },
      { id: "b", position: 1 },
    ];
    const result = reorderRoutineExercises(unordered, "c", "a");
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("ignores an id that isn't in the list", () => {
    const result = reorderRoutineExercises(items("a", "b"), "missing", "a");
    expect(result.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
