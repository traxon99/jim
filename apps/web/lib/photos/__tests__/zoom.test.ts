import { describe, expect, it } from "vitest";
import { DOUBLE_TAP_SCALE, FIT, MAX_SCALE, clampTransform, doubleTap, pinch } from "../zoom";

const frame = { width: 400, height: 600 };
const image = { width: 400, height: 533 };

describe("pinch", () => {
  const start = [
    { x: -50, y: 0 },
    { x: 50, y: 0 },
  ] as const;

  it("scales by how far the fingers moved apart", () => {
    const next = pinch(FIT, start, [
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(next.scale).toBe(2);
    expect(next.x).toBeCloseTo(0);
  });

  it("never zooms out past fit or in past the maximum", () => {
    expect(
      pinch(FIT, start, [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ]).scale,
    ).toBe(1);
    expect(
      pinch(FIT, start, [
        { x: -1000, y: 0 },
        { x: 1000, y: 0 },
      ]).scale,
    ).toBe(MAX_SCALE);
  });

  it("keeps the point under the fingers in place", () => {
    // Both fingers move right while spreading: the midpoint's picture point stays put.
    const next = pinch(
      FIT,
      [
        { x: 50, y: 0 },
        { x: 150, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
    );
    expect(next.scale).toBe(2);
    // The picture point at 100 now sits under the new midpoint (100): 100 * 2 + x = 100.
    expect(next.x).toBeCloseTo(-100);
  });
});

describe("clampTransform", () => {
  it("cannot pan at fit", () => {
    expect(clampTransform({ scale: 1, x: 80, y: -80 }, frame, image)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it("stops at the picture's edge when zoomed", () => {
    const clamped = clampTransform({ scale: 2, x: 999, y: -999 }, frame, image);
    expect(clamped.x).toBe(200);
    expect(clamped.y).toBeCloseTo(-(533 * 2 - 600) / 2);
  });
});

describe("doubleTap", () => {
  it("zooms in around the tap, then back to fit", () => {
    const zoomed = doubleTap(FIT, { x: 40, y: -20 });
    expect(zoomed.scale).toBe(DOUBLE_TAP_SCALE);
    expect(zoomed.x).toBeCloseTo(-40 * (DOUBLE_TAP_SCALE - 1));
    expect(doubleTap(zoomed, { x: 0, y: 0 })).toEqual(FIT);
  });
});
