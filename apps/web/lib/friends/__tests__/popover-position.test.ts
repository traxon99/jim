import { describe, expect, it } from "vitest";
import { popoverPosition } from "../popover-position";

const screen = { width: 393, height: 852 };
const own = { width: 300, height: 52 };

describe("popoverPosition", () => {
  it("opens above the button", () => {
    expect(popoverPosition({ top: 500, bottom: 544, left: 16 }, own, screen)).toEqual({
      top: 440,
      left: 12,
    });
  });

  it("stays inside the right edge", () => {
    expect(popoverPosition({ top: 500, bottom: 544, left: 340 }, own, screen).left).toBe(81);
  });

  it("opens below when the header leaves no room above", () => {
    expect(popoverPosition({ top: 90, bottom: 134, left: 16 }, own, screen).top).toBe(142);
  });

  it("never runs off the bottom", () => {
    expect(popoverPosition({ top: 40, bottom: 840, left: 16 }, own, screen).top).toBe(788);
  });
});
