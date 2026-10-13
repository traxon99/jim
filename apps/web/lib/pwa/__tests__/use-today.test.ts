import { describe, expect, it } from "vitest";
import { sameDayOrNow } from "../use-today";

describe("sameDayOrNow (#523)", () => {
  it("keeps the same Date within a local day, so memos don't recompute", () => {
    const current = new Date(2026, 9, 12, 8, 0);
    expect(sameDayOrNow(current, new Date(2026, 9, 12, 23, 59))).toBe(current);
  });

  it("moves to now once the local date changes", () => {
    const now = new Date(2026, 9, 13, 0, 1);
    expect(sameDayOrNow(new Date(2026, 9, 12, 23, 58), now)).toBe(now);
  });
});
