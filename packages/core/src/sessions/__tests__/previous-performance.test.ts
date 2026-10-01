import { describe, expect, it } from "vitest";
import {
  findPreviousSessionExerciseId,
  plannedSetRowCount,
  prefillWeightForSet,
  setKindOrdinals,
  splitPreviousSets,
} from "../previous-performance";

function prior(setIndex: number, kind: string, weight: number) {
  return { setIndex, kind, weight, reps: 5, completedAt: new Date() };
}

describe("splitPreviousSets", () => {
  it("keeps working sets in set order", () => {
    const set0 = prior(0, "working", 135);
    const set1 = prior(1, "working", 145);
    expect(splitPreviousSets([set1, set0])).toEqual({ warmups: [], working: [set0, set1] });
  });

  it("separates warm-ups so working set 1 is the first set after them", () => {
    const w0 = prior(0, "warmup", 45);
    const w1 = prior(1, "warmup", 95);
    const s2 = prior(2, "working", 135);
    const s3 = prior(3, "failure", 135);
    const { warmups, working } = splitPreviousSets([s2, w0, s3, w1]);
    expect(warmups).toEqual([w0, w1]);
    expect(working).toEqual([s2, s3]);
  });

  it("is empty for no prior sets", () => {
    expect(splitPreviousSets([])).toEqual({ warmups: [], working: [] });
  });
});

describe("findPreviousSessionExerciseId", () => {
  it("picks the most recent session_exercise that isn't the current session", () => {
    const result = findPreviousSessionExerciseId(
      [
        { id: "se-old", sessionId: "s-old", startedAt: new Date("2026-01-01") },
        { id: "se-recent", sessionId: "s-recent", startedAt: new Date("2026-01-10") },
        { id: "se-current", sessionId: "s-current", startedAt: new Date("2026-01-15") },
      ],
      "s-current",
    );
    expect(result).toBe("se-recent");
  });

  it("returns null when there's no prior session for this exercise", () => {
    const result = findPreviousSessionExerciseId(
      [{ id: "se-current", sessionId: "s-current", startedAt: new Date() }],
      "s-current",
    );
    expect(result).toBeNull();
  });
});

describe("prefillWeightForSet", () => {
  const previous = { setIndex: 0, kind: "working", weight: 135, reps: 5, completedAt: new Date() };

  it("fills the exercise's first set with last time's weight", () => {
    expect(prefillWeightForSet(0, previous)).toBe("135");
  });

  it("fills later sets with last time's weight at that same position too", () => {
    const previousSet2 = { ...previous, setIndex: 1, weight: 145 };
    expect(prefillWeightForSet(1, previousSet2)).toBe("145");
  });

  it("leaves the first set empty when there's no history for it", () => {
    expect(prefillWeightForSet(0, undefined)).toBe("");
  });

  it("leaves a set empty when the prior set's weight is bodyweight (null)", () => {
    expect(prefillWeightForSet(0, { ...previous, weight: null })).toBe("");
  });

  it("falls back to a progressive-overload target when there's no prior set at all", () => {
    expect(prefillWeightForSet(0, undefined, 145)).toBe("145");
  });

  it("prefers last time's weight over the fallback when both are available", () => {
    expect(prefillWeightForSet(0, previous, 145)).toBe("135");
  });

  it("ignores the fallback for sets after the first, which have nothing to fall back on", () => {
    expect(prefillWeightForSet(1, undefined, 145)).toBe("");
  });
});

describe("plannedSetRowCount", () => {
  const allWorking = () => "working";

  it("plans one row per working set", () => {
    expect(plannedSetRowCount(3, 0, allWorking)).toBe(3);
  });

  it("plans at least one row", () => {
    expect(plannedSetRowCount(0, 0, allWorking)).toBe(1);
  });

  it("adds warm-ups on top of the working sets", () => {
    const kindAt = (index: number) => (index < 3 ? "warmup" : "working");
    expect(plannedSetRowCount(3, 3, kindAt)).toBe(6);
  });

  it("keeps the working sets when a row is switched to a warm-up", () => {
    const kindAt = (index: number) => (index === 1 ? "warmup" : "working");
    expect(plannedSetRowCount(3, 0, kindAt)).toBe(4);
  });

  it("covers every row already logged, even past the plan", () => {
    expect(plannedSetRowCount(3, 5, allWorking)).toBe(5);
  });

  it("adds no extra row once the plan is logged", () => {
    expect(plannedSetRowCount(2, 2, allWorking)).toBe(2);
  });
});

describe("setKindOrdinals", () => {
  it("counts warm-ups and working sets separately", () => {
    expect(setKindOrdinals(["warmup", "warmup", "working", "failure", "warmup"])).toEqual([
      0, 1, 0, 1, 2,
    ]);
  });
});
