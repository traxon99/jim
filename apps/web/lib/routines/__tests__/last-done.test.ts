import { describe, expect, it } from "vitest";
import { formatLastDone, lastDoneByRoutine } from "../last-done";

describe("lastDoneByRoutine", () => {
  it("keeps each routine's latest finished, undeleted session", () => {
    const map = lastDoneByRoutine([
      {
        routineId: "push",
        startedAt: new Date(2026, 8, 1),
        endedAt: new Date(2026, 8, 1),
        deletedAt: null,
      },
      {
        routineId: "push",
        startedAt: new Date(2026, 8, 20),
        endedAt: new Date(2026, 8, 20),
        deletedAt: null,
      },
      {
        routineId: "push",
        startedAt: new Date(2026, 8, 25),
        endedAt: new Date(2026, 8, 25),
        deletedAt: new Date(),
      },
      { routineId: "pull", startedAt: new Date(2026, 8, 28), endedAt: null, deletedAt: null },
      {
        routineId: null,
        startedAt: new Date(2026, 8, 28),
        endedAt: new Date(2026, 8, 28),
        deletedAt: null,
      },
    ]);
    expect(map.get("push")).toEqual(new Date(2026, 8, 20));
    expect(map.has("pull")).toBe(false);
    expect(map.size).toBe(1);
  });
});

describe("formatLastDone", () => {
  const now = new Date(2026, 8, 29, 9, 0);

  it("counts calendar days, not 24-hour spans", () => {
    expect(formatLastDone(new Date(2026, 8, 29, 7, 0), now)).toBe("Today");
    expect(formatLastDone(new Date(2026, 8, 28, 23, 30), now)).toBe("Yesterday");
    expect(formatLastDone(new Date(2026, 8, 26, 18, 0), now)).toBe("3 days ago");
  });

  it("switches to weeks from two weeks, then to a date", () => {
    expect(formatLastDone(new Date(2026, 8, 16), now)).toBe("13 days ago");
    expect(formatLastDone(new Date(2026, 8, 15), now)).toBe("2 weeks ago");
    expect(formatLastDone(new Date(2026, 6, 29), now)).toBe("8 weeks ago");
    expect(formatLastDone(new Date(2026, 5, 1), now)).toMatch(/Jun|6/);
  });
});
