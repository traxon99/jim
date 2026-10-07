import { describe, expect, it } from "vitest";
import { deletedWarmupIndices, setNumberLabels } from "../set-kinds";

describe("setNumberLabels", () => {
  it("numbers sets from 1 when there are no warm-ups", () => {
    expect(setNumberLabels(["working", "working", "failure"])).toEqual(["1", "2", "3"]);
  });

  it("marks warm-ups W and starts working sets at 1 after them", () => {
    expect(setNumberLabels(["warmup", "warmup", "working", "working"])).toEqual([
      "W",
      "W",
      "1",
      "2",
    ]);
  });

  it("doesn't count a warm-up logged between working sets", () => {
    expect(setNumberLabels(["working", "warmup", "working"])).toEqual(["1", "W", "2"]);
  });

  it("counts legacy drop sets like any other non-warm-up set", () => {
    expect(setNumberLabels(["warmup", "working", "drop"])).toEqual(["W", "1", "2"]);
  });

  it("handles an empty list", () => {
    expect(setNumberLabels([])).toEqual([]);
  });
});

describe("deletedWarmupIndices", () => {
  it("returns the indices of deleted warm-ups only (issue #438)", () => {
    const at = new Date();
    expect(
      deletedWarmupIndices([
        { setIndex: 0, kind: "warmup", deletedAt: at },
        { setIndex: 1, kind: "warmup", deletedAt: null },
        { setIndex: 2, kind: "working", deletedAt: at },
      ]),
    ).toEqual(new Set([0]));
  });
});
