import { describe, expect, it } from "vitest";
import {
  jumpFor,
  normalizeEquipment,
  resolveIncrement,
  roundToIncrement,
} from "../equipment-increments";
import { DPR_PRESETS } from "../presets";

describe("normalizeEquipment", () => {
  it.each([
    ["barbell", "barbell"],
    ["Barbell", "barbell"],
    ["e-z curl bar", "ez-bar"],
    ["EZ Bar", "ez-bar"],
    ["dumbbell", "dumbbell"],
    ["Dumbbells", "dumbbell"],
    ["machine", "machine"],
    ["smith machine", "machine"],
    ["cable", "cable"],
    ["kettlebells", "kettlebell"],
    ["body only", "other"],
    ["bands", "other"],
    ["", "other"],
    [null, "other"],
  ] as const)("%s → %s", (text, bucket) => {
    expect(normalizeEquipment(text)).toBe(bucket);
  });
});

describe("resolveIncrement", () => {
  it.each([
    ["barbell", "lb", 2.5],
    ["barbell", "kg", 1.25],
    ["e-z curl bar", "lb", 2.5],
    ["dumbbell", "lb", 5],
    ["dumbbell", "kg", 2],
    ["machine", "kg", 2.5],
    ["cable", "lb", 5],
    ["kettlebells", "lb", 9],
    ["kettlebells", "kg", 4],
    ["something weird", "lb", 5],
    ["something weird", "kg", 2.5],
  ] as const)("%s in %s → %s", (equipment, units, step) => {
    expect(resolveIncrement(equipment, units)).toBe(step);
  });

  it("prefers a user override over the default", () => {
    expect(resolveIncrement("barbell", "lb", { barbell: { lb: 5 } })).toBe(5);
    expect(resolveIncrement("barbell", "kg", { barbell: { lb: 5 } })).toBe(1.25);
  });
});

describe("roundToIncrement", () => {
  it.each([
    [186, 2.5, "nearest", 185],
    [186.3, 2.5, "nearest", 187.5],
    [186.3, 2.5, "down", 185],
    [185.1, 2.5, "up", 187.5],
    [187.5, 2.5, "down", 187.5],
    [166.5, 5, "down", 165],
    [83.3, 1.25, "down", 82.5],
    [0.1 + 0.2, 0.1, "down", 0.3],
  ] as const)("%s by %s (%s) → %s", (weight, step, mode, expected) => {
    expect(roundToIncrement(weight, step, mode)).toBe(expected);
  });
});

describe("jumpFor", () => {
  it("adds exactly one step for Conservative: 185 → 187.5", () => {
    expect(185 + jumpFor(185, DPR_PRESETS.conservative, 2.5)).toBe(187.5);
  });

  it("takes ~2.5% for Moderate, rounded to the step", () => {
    expect(jumpFor(185, DPR_PRESETS.moderate, 2.5)).toBe(5);
    expect(jumpFor(300, DPR_PRESETS.moderate, 2.5)).toBe(7.5);
  });

  it("takes ~5% for Aggressive", () => {
    expect(jumpFor(200, DPR_PRESETS.aggressive, 2.5)).toBe(10);
  });

  it("never moves dumbbells by less than a 5 lb step", () => {
    for (const preset of Object.values(DPR_PRESETS)) {
      const jump = jumpFor(40, preset, 5);
      expect(jump).toBeGreaterThanOrEqual(5);
      expect(jump % 5).toBe(0);
    }
  });

  it("works in kg", () => {
    expect(jumpFor(100, DPR_PRESETS.moderate, 1.25)).toBe(2.5);
    expect(jumpFor(20, DPR_PRESETS.moderate, 1.25)).toBe(1.25);
  });
});
