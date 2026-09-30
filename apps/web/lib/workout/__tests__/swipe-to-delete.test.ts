import { describe, expect, it } from "vitest";
import {
  SWIPE_DELETE_MAX_PX,
  swipeDeleteThreshold,
  swipeDeletes,
  swipeIntent,
  swipeOffset,
} from "../swipe-to-delete";

describe("swipeIntent", () => {
  it("waits until the finger has moved past the slop", () => {
    expect(swipeIntent(0, 0)).toBe("undecided");
    expect(swipeIntent(-5, 3)).toBe("undecided");
  });

  it("treats a mostly-leftward drag as a swipe", () => {
    expect(swipeIntent(-20, 5)).toBe("swipe");
    expect(swipeIntent(-12, -11)).toBe("swipe");
  });

  it("leaves vertical and rightward drags to the page", () => {
    expect(swipeIntent(-5, 20)).toBe("scroll");
    expect(swipeIntent(-15, -30)).toBe("scroll");
    expect(swipeIntent(25, 0)).toBe("scroll");
  });
});

describe("swipeOffset", () => {
  it("follows the finger leftwards", () => {
    expect(swipeOffset(-80, 360)).toBe(-80);
  });

  it("never moves right or past the row's width", () => {
    expect(swipeOffset(40, 360)).toBe(0);
    expect(swipeOffset(-500, 360)).toBe(-360);
  });
});

describe("swipeDeletes", () => {
  it("deletes past a share of a narrow row's width", () => {
    const width = 300;
    expect(swipeDeleteThreshold(width)).toBeCloseTo(105);
    expect(swipeDeletes(-104, width)).toBe(false);
    expect(swipeDeletes(-106, width)).toBe(true);
  });

  it("caps the distance on wide rows", () => {
    expect(swipeDeleteThreshold(1000)).toBe(SWIPE_DELETE_MAX_PX);
    expect(swipeDeletes(-SWIPE_DELETE_MAX_PX, 1000)).toBe(true);
  });

  it("snaps back from a short swipe or an unmeasured row", () => {
    expect(swipeDeletes(-20, 360)).toBe(false);
    expect(swipeDeletes(-50, 0)).toBe(false);
  });
});
