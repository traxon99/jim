import { describe, expect, it } from "vitest";
import {
  EDGE_SCROLL_MAX_PX,
  REORDER_ROW_PX,
  dropIndex,
  edgeScrollSpeed,
  moveId,
  stillPressing,
} from "../reorder-drag";

describe("stillPressing", () => {
  it("allows a little finger wobble", () => {
    expect(stillPressing(3, -4)).toBe(true);
  });

  it("treats a real move as a scroll", () => {
    expect(stillPressing(0, 14)).toBe(false);
  });
});

describe("dropIndex", () => {
  it("drops into the slot under the row's middle", () => {
    expect(dropIndex(0, 4)).toBe(0);
    expect(dropIndex(REORDER_ROW_PX * 2, 4)).toBe(2);
    expect(dropIndex(REORDER_ROW_PX * 1.6, 4)).toBe(2);
    expect(dropIndex(REORDER_ROW_PX * 1.4, 4)).toBe(1);
  });

  it("clamps to the list", () => {
    expect(dropIndex(-500, 4)).toBe(0);
    expect(dropIndex(5000, 4)).toBe(3);
    expect(dropIndex(100, 0)).toBe(0);
  });
});

describe("moveId", () => {
  it("moves an id later", () => {
    expect(moveId(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an id earlier", () => {
    expect(moveId(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("clamps the index and ignores unknown ids", () => {
    expect(moveId(["a", "b"], "a", 9)).toEqual(["b", "a"]);
    expect(moveId(["a", "b"], "x", 0)).toEqual(["a", "b"]);
  });
});

describe("edgeScrollSpeed", () => {
  const top = 100;
  const bottom = 800;

  it("stays still away from the edges", () => {
    expect(edgeScrollSpeed(450, top, bottom)).toBe(0);
  });

  it("scrolls up near the top and down near the bottom", () => {
    expect(edgeScrollSpeed(120, top, bottom)).toBeLessThan(0);
    expect(edgeScrollSpeed(780, top, bottom)).toBeGreaterThan(0);
  });

  it("goes faster the closer the finger gets, up to the cap", () => {
    expect(Math.abs(edgeScrollSpeed(110, top, bottom))).toBeGreaterThan(
      Math.abs(edgeScrollSpeed(150, top, bottom)),
    );
    expect(edgeScrollSpeed(0, top, bottom)).toBe(-EDGE_SCROLL_MAX_PX);
    expect(edgeScrollSpeed(900, top, bottom)).toBe(EDGE_SCROLL_MAX_PX);
  });
});
