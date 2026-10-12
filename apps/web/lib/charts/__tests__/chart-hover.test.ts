import { describe, expect, it } from "vitest";
import { clientXToViewBox, formatSetLine, nearestIndexByX, tooltipAlign } from "../chart-hover";

describe("nearestIndexByX", () => {
  it("picks the closest point, preferring the later one on a tie", () => {
    expect(nearestIndexByX([10, 50, 90], 60)).toBe(1);
    expect(nearestIndexByX([10, 50, 90], 70)).toBe(2);
    expect(nearestIndexByX([10, 50, 90], -5)).toBe(0);
  });

  it("returns null with no points", () => {
    expect(nearestIndexByX([], 10)).toBeNull();
  });
});

describe("clientXToViewBox", () => {
  it("scales the on-screen offset into viewBox units", () => {
    expect(clientXToViewBox(150, { left: 100, width: 200 }, 320)).toBe(80);
    expect(clientXToViewBox(150, { left: 100, width: 0 }, 320)).toBe(0);
  });
});

describe("tooltipAlign", () => {
  it("opens away from the nearest edge", () => {
    expect(tooltipAlign(0.05)).toBe("left");
    expect(tooltipAlign(0.5)).toBe("center");
    expect(tooltipAlign(0.95)).toBe("right");
  });
});

describe("formatSetLine", () => {
  it("shows weight, units and reps", () => {
    expect(formatSetLine(225, 5, "lb")).toBe("225 lb × 5");
    expect(formatSetLine(102.5, 8)).toBe("102.5 × 8");
  });
});
