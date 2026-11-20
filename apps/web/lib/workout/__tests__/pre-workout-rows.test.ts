import { describe, expect, it } from "vitest";
import { visiblePreWorkoutRows } from "../pre-workout-preview";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("visiblePreWorkoutRows (#856)", () => {
  it("shows every row up to six", () => {
    expect(visiblePreWorkoutRows(rows(0), false)).toEqual({ shown: [], hidden: 0 });
    expect(visiblePreWorkoutRows(rows(6), false)).toEqual({ shown: rows(6), hidden: 0 });
  });

  it("collapses a longer list to five and a count", () => {
    expect(visiblePreWorkoutRows(rows(7), false)).toEqual({ shown: rows(5), hidden: 2 });
    expect(visiblePreWorkoutRows(rows(12), false)).toEqual({ shown: rows(5), hidden: 7 });
  });

  it("shows everything once expanded", () => {
    expect(visiblePreWorkoutRows(rows(12), true)).toEqual({ shown: rows(12), hidden: 0 });
  });
});
