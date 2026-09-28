import { describe, expect, it } from "vitest";
import type { DprDecision } from "../decide";
import { applyIntensity } from "../intensity";

function decision(overrides: Partial<DprDecision> = {}): DprDecision {
  return {
    call: "increase",
    weight: 190,
    previousWeight: 185,
    targetReps: 6,
    reason: "Hit 3×8 @ RPE 7",
    streak: 1,
    ...overrides,
  };
}

describe("applyIntensity", () => {
  it("leaves the call alone with no pick or on push", () => {
    const d = decision();
    expect(applyIntensity(d, null, 2.5)).toBe(d);
    expect(applyIntensity(d, undefined, 2.5)).toBe(d);
    expect(applyIntensity(d, "push", 2.5)).toBe(d);
  });

  it("turns an increase into a hold at last session's weight on maintain", () => {
    const d = applyIntensity(decision(), "maintain", 2.5);
    expect(d.call).toBe("hold");
    expect(d.weight).toBe(185);
    expect(d.targetReps).toBeNull();
  });

  it.each(["hold", "deload", "reenter"] as const)("keeps a %s on maintain", (call) => {
    const d = decision({ call, weight: 170 });
    expect(applyIntensity(d, "maintain", 2.5)).toBe(d);
  });

  it("goes ~10% under the lighter of the call and last weight on light", () => {
    const d = applyIntensity(decision(), "light", 2.5);
    expect(d.call).toBe("light");
    // min(190, 185) = 185 × 0.9 = 166.5 → 165
    expect(d.weight).toBe(165);
    expect(d.previousWeight).toBe(185);
    expect(d.reason).toBe("Light day — 165 instead of 185");
  });

  it("goes light from a deload's weight, not above it", () => {
    const d = applyIntensity(
      decision({ call: "deload", weight: 180, previousWeight: 200 }),
      "light",
      5,
    );
    // 180 × 0.9 = 162 → 160
    expect(d.weight).toBe(160);
  });

  it("leaves a no-history call alone on light", () => {
    const d = decision({ call: "insufficient", weight: 95, previousWeight: null, targetReps: 6 });
    expect(applyIntensity(d, "light", 2.5)).toBe(d);
  });
});
