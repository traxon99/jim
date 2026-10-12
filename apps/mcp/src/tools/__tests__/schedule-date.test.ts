import { describe, expect, it } from "vitest";
import { parseScheduleDate, scheduleDateSchema } from "../schedule-workout.js";

describe("schedule_workout date input (#540)", () => {
  it("accepts a plain day and stores it as noon UTC", () => {
    expect(scheduleDateSchema.safeParse("2026-10-20").success).toBe(true);
    expect(parseScheduleDate("2026-10-20").toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });

  it("accepts date-times with Z or an offset and keeps the instant", () => {
    expect(scheduleDateSchema.safeParse("2026-10-20T09:00:00Z").success).toBe(true);
    expect(scheduleDateSchema.safeParse("2026-10-20T09:00:00-04:00").success).toBe(true);
    expect(parseScheduleDate("2026-10-20T09:00:00-04:00").toISOString()).toBe(
      "2026-10-20T13:00:00.000Z",
    );
  });

  it("rejects impossible days and other formats", () => {
    expect(scheduleDateSchema.safeParse("2026-02-31").success).toBe(false);
    expect(scheduleDateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(scheduleDateSchema.safeParse("10/20/2026").success).toBe(false);
    expect(scheduleDateSchema.safeParse("2026-10-20T09:00:00").success).toBe(false);
  });
});
