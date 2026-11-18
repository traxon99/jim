import { describe, expect, it } from "vitest";
import { bodyweightRange, trailingAverage } from "../weight-range";

const day = (n: number, value: number) => ({
  measuredAt: new Date(Date.UTC(2026, 10, 1 + n, 7)),
  value,
});

describe("trailingAverage", () => {
  it("averages the entries in the trailing window only", () => {
    const points = [day(0, 180), day(1, 182), day(10, 178)];
    expect(trailingAverage(points, 7)).toEqual([180, 181, 178]);
  });
});

describe("bodyweightRange (#825)", () => {
  it("uses ±1% water swing plus scale error with too few weigh-ins", () => {
    const [band] = bodyweightRange([day(0, 200)], 7, "lb");
    const half = Math.sqrt(0.5 ** 2 + 2 ** 2);
    expect(band?.mid).toBe(200);
    expect(band?.low).toBeCloseTo(200 - half);
    expect(band?.high).toBeCloseTo(200 + half);
  });

  it("measures the water swing from the window once there are enough weigh-ins", () => {
    const points = [day(0, 80), day(1, 82), day(2, 81)];
    const band = bodyweightRange(points, 7, "kg")[2];
    // Sample standard deviation of 80, 82, 81 is 1; scale error is 0.2 kg.
    const half = Math.sqrt(0.2 ** 2 + 1);
    expect(band?.mid).toBe(81);
    expect(band?.high).toBeCloseTo(81 + half);
    expect(band?.low).toBeCloseTo(81 - half);
  });

  it("narrows to about the scale's error when weigh-ins agree", () => {
    const points = [day(0, 80), day(1, 80), day(2, 80), day(3, 80)];
    const band = bodyweightRange(points, 7, "kg")[3];
    expect(band?.high).toBeCloseTo(80.2);
    expect(band?.low).toBeCloseTo(79.8);
  });
});
