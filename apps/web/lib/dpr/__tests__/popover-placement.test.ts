import { describe, expect, it } from "vitest";
import { prpPopoverPlacement } from "../popover-placement";

const screen = { width: 393, height: 852 };
const badge = { top: 300, bottom: 344, left: 32 };

describe("prpPopoverPlacement", () => {
  it("opens below the badge, its tail over the badge", () => {
    expect(prpPopoverPlacement(badge, 320, screen)).toEqual({
      top: 352,
      left: 12,
      width: 369,
      maxHeight: 488,
      below: true,
      tailX: 42,
    });
  });

  it("opens above when it doesn't fit below and there's more room above", () => {
    const low = { top: 700, bottom: 744, left: 32 };
    const place = prpPopoverPlacement(low, 320, screen);
    expect(place.below).toBe(false);
    expect(place.top + 320).toBe(692);
  });

  it("never covers the badge: a tall list scrolls in the room it gets", () => {
    const place = prpPopoverPlacement(badge, 2000, screen);
    expect(place.below).toBe(true);
    expect(place.top).toBeGreaterThan(badge.bottom);
    expect(place.top + place.maxHeight).toBe(840);
  });

  it("stays inside a narrow screen", () => {
    const place = prpPopoverPlacement({ ...badge, left: 300 }, 320, { width: 320, height: 568 });
    expect(place.width).toBe(296);
    expect(place.left).toBe(12);
  });
});
