import { describe, expect, it } from "vitest";
import { calculatePlateBreakdown, nearestLoadableWeight } from "../plate-math";

const STANDARD_PLATES = [45, 35, 25, 10, 5, 2.5];

describe("calculatePlateBreakdown", () => {
  it("225 lb on a 45 lb bar loads 2x45 per side", () => {
    const result = calculatePlateBreakdown(225, 45, STANDARD_PLATES);
    expect(result).toEqual({ perSide: [45, 45], remainderPerSide: 0 });
  });

  it("loads the bar alone when the target equals the bar weight", () => {
    expect(calculatePlateBreakdown(45, 45, STANDARD_PLATES)).toEqual({
      perSide: [],
      remainderPerSide: 0,
    });
  });

  it("loads nothing when the target is under the bar weight", () => {
    expect(calculatePlateBreakdown(20, 45, STANDARD_PLATES)).toEqual({
      perSide: [],
      remainderPerSide: 0,
    });
  });

  it("greedily prefers larger plates first", () => {
    // (185 - 45) / 2 = 70 per side -> 45 + 25
    expect(calculatePlateBreakdown(185, 45, STANDARD_PLATES).perSide).toEqual([45, 25]);
  });

  it("uses multiple plates of the same size when needed", () => {
    // (405 - 45) / 2 = 180 per side -> 45 + 45 + 45 + 45
    expect(calculatePlateBreakdown(405, 45, STANDARD_PLATES).perSide).toEqual([45, 45, 45, 45]);
  });

  it("reports a remainder when the plates on hand can't make up the exact weight", () => {
    // (100 - 45) / 2 = 27.5 per side -> 25, remainder 2.5
    const result = calculatePlateBreakdown(100, 45, [45, 25, 10]);
    expect(result).toEqual({ perSide: [25], remainderPerSide: 2.5 });
  });

  it("handles a fractional plate set (kg)", () => {
    // (110 - 20) / 2 = 45 per side -> 20 + 20 + 5
    expect(calculatePlateBreakdown(110, 20, [20, 15, 10, 5, 2.5, 1.25]).perSide).toEqual([
      20, 20, 5,
    ]);
  });
});

describe("nearestLoadableWeight", () => {
  const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

  it("rounds a computed suggestion to the nearest weight the plates can make", () => {
    expect(nearestLoadableWeight(231.43, 45, LB_PLATES)).toBe(230);
    expect(nearestLoadableWeight(51.08, 45, LB_PLATES)).toBe(50);
    expect(nearestLoadableWeight(109.46, 45, LB_PLATES)).toBe(110);
    expect(nearestLoadableWeight(182.43, 45, LB_PLATES)).toBe(180);
  });

  it("rounds up when the next load is closer", () => {
    expect(nearestLoadableWeight(143.9, 45, LB_PLATES)).toBe(145);
  });

  it("leaves an already-loadable weight alone", () => {
    expect(nearestLoadableWeight(225, 45, LB_PLATES)).toBe(225);
  });

  it("goes to the lighter load on a tie", () => {
    expect(nearestLoadableWeight(50, 45, [5])).toBe(45);
  });

  it("never suggests less than the empty bar", () => {
    expect(nearestLoadableWeight(30, 45, LB_PLATES)).toBe(45);
  });

  it("uses the plates it's given (kg)", () => {
    expect(nearestLoadableWeight(77.14, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toBe(77.5);
  });

  it("only tidies float noise when there are no plates", () => {
    expect(nearestLoadableWeight(77.144, 20, [])).toBe(77.14);
  });
});
