import { describe, expect, it } from "vitest";
import { isRestComplete, remainingRestSeconds, restEndsAt } from "../rest-timer";

describe("restEndsAt / remainingRestSeconds", () => {
  it("computes the end timestamp from a duration", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(restEndsAt(now, 90)).toEqual(new Date("2026-01-01T00:01:30.000Z"));
  });

  it("derives remaining time from the absolute end timestamp, not elapsed ticks", () => {
    const endsAt = new Date("2026-01-01T00:01:30.000Z");
    const now = new Date("2026-01-01T00:00:45.000Z");
    expect(remainingRestSeconds(endsAt, now)).toBe(45);
  });

  it("recomputes correctly after being backgrounded for a while (no drift)", () => {
    const endsAt = restEndsAt(new Date("2026-01-01T00:00:00.000Z"), 90);
    // The app was backgrounded and resumes 3 minutes later.
    const resumedAt = new Date("2026-01-01T00:03:00.000Z");
    expect(remainingRestSeconds(endsAt, resumedAt)).toBe(0);
    expect(isRestComplete(endsAt, resumedAt)).toBe(true);
  });

  it("never returns negative remaining time", () => {
    const endsAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:05:00.000Z");
    expect(remainingRestSeconds(endsAt, now)).toBe(0);
  });

  it("is not complete before the end timestamp", () => {
    const endsAt = new Date("2026-01-01T00:01:30.000Z");
    const now = new Date("2026-01-01T00:01:00.000Z");
    expect(isRestComplete(endsAt, now)).toBe(false);
  });
});
