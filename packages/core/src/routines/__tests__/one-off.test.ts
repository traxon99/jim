import { describe, expect, it } from "vitest";
import {
  type OneOffRoutine,
  finishedRoutineIds,
  isCalendarDay,
  oneOffFields,
  oneOffLifetime,
  oneOffStatus,
  oneOffTimeLeft,
  oneOffsReplacedBy,
  startedRoutineIds,
} from "../one-off";

const created = new Date("2026-11-15T18:00:00Z");

function routine(overrides: Partial<OneOffRoutine> = {}): OneOffRoutine {
  return {
    id: "r1",
    oneOff: true,
    oneOffExpiresAt: null,
    oneOffDay: null,
    createdAt: created,
    deletedAt: null,
    ...overrides,
  };
}

const none = new Set<string>();

describe("one-off workouts (#798)", () => {
  it("writes each lifetime's fields", () => {
    expect(oneOffFields("24h", created)).toEqual({
      oneOff: true,
      oneOffExpiresAt: new Date("2026-11-16T18:00:00Z"),
      oneOffDay: null,
    });
    expect(oneOffFields("until_done", created)).toEqual({
      oneOff: true,
      oneOffExpiresAt: null,
      oneOffDay: null,
    });
    expect(oneOffFields({ day: "2026-11-21" }, created).oneOffDay).toBe("2026-11-21");
    expect(() => oneOffFields({ day: "2026-02-30" }, created)).toThrow("calendar day");
    expect(isCalendarDay("2026-11-21")).toBe(true);
    expect(isCalendarDay("11/21/2026")).toBe(false);
  });

  it("reads the lifetime back", () => {
    expect(oneOffLifetime(routine({ oneOff: false }))).toBeNull();
    expect(oneOffLifetime(routine({ oneOffExpiresAt: new Date() }))).toBe("24h");
    expect(oneOffLifetime(routine({ oneOffDay: "2026-11-21" }))).toEqual({ day: "2026-11-21" });
    expect(oneOffLifetime(routine())).toBe("until_done");
  });

  it("ends a 24-hour one-off at its deadline", () => {
    const r = routine(oneOffFields("24h", created));
    const at = (iso: string) => oneOffStatus(r, { now: new Date(iso), finished: none });
    expect(at("2026-11-16T17:59:00Z")).toBe("live");
    expect(at("2026-11-16T18:00:00Z")).toBe("ended");
  });

  it("ends any one-off once a workout from it is finished, or it's discarded", () => {
    const clock = { now: created, finished: new Set(["r1"]) };
    expect(oneOffStatus(routine(), clock)).toBe("ended");
    expect(oneOffStatus(routine({ deletedAt: created }), { now: created, finished: none })).toBe(
      "ended",
    );
    expect(oneOffStatus(routine(), { now: new Date("2030-01-01"), finished: none })).toBe("live");
  });

  it("lives through its day in the phone's timezone", () => {
    const r = routine({ oneOffDay: "2026-11-21" });
    const on = (today: string) => oneOffStatus(r, { now: created, today, finished: none });
    expect(on("2026-11-20")).toBe("upcoming");
    expect(on("2026-11-21")).toBe("live");
    expect(on("2026-11-22")).toBe("ended");
  });

  it("uses UTC bounds every timezone agrees on when the server has no timezone", () => {
    const r = routine({ oneOffDay: "2026-11-21" });
    const at = (iso: string) => oneOffStatus(r, { now: new Date(iso), finished: none });
    expect(at("2026-11-20T09:59:00Z")).toBe("upcoming");
    expect(at("2026-11-20T10:00:00Z")).toBe("live");
    expect(at("2026-11-22T11:59:00Z")).toBe("live");
    expect(at("2026-11-22T12:00:00Z")).toBe("ended");
  });

  it("treats a normal routine as always live", () => {
    expect(
      oneOffStatus(routine({ oneOff: false }), { now: created, finished: new Set(["r1"]) }),
    ).toBe("live");
  });

  it("collects finished and started routines from sessions", () => {
    const sessions = [
      { routineId: "a", endedAt: created, deletedAt: null },
      { routineId: "b", endedAt: null, deletedAt: null },
      { routineId: "c", endedAt: created, deletedAt: created },
      { routineId: null, endedAt: created, deletedAt: null },
    ];
    expect([...finishedRoutineIds(sessions)]).toEqual(["a"]);
    expect([...startedRoutineIds(sessions)]).toEqual(["a", "b"]);
  });

  it("replaces older unstarted 24h and until-done one-offs, never day ones", () => {
    const rows = [
      routine({ id: "old-24h", oneOffExpiresAt: created }),
      routine({ id: "old-until" }),
      routine({ id: "started" }),
      routine({ id: "saturday", oneOffDay: "2026-11-21" }),
      routine({ id: "gone", deletedAt: created }),
      routine({ id: "kept", oneOff: false }),
    ];
    const started = new Set(["started"]);
    expect(oneOffsReplacedBy("24h", rows, started)).toEqual(["old-24h", "old-until"]);
    expect(oneOffsReplacedBy("until_done", rows, started)).toEqual(["old-24h", "old-until"]);
    expect(oneOffsReplacedBy({ day: "2026-11-23" }, rows, started)).toEqual([]);
  });

  it("drains the time left toward the deadline", () => {
    const r = routine(oneOffFields("24h", created));
    expect(oneOffTimeLeft(r, created)).toBe(1);
    expect(oneOffTimeLeft(r, new Date("2026-11-16T12:00:00Z"))).toBe(0.25);
    expect(oneOffTimeLeft(r, new Date("2026-11-17T00:00:00Z"))).toBe(0);
    expect(oneOffTimeLeft(routine(), created)).toBeNull();
    const day = routine({ oneOffDay: "2026-11-21", createdAt: new Date("2026-11-01") });
    const bounds = {
      start: new Date("2026-11-21T00:00:00Z"),
      end: new Date("2026-11-22T00:00:00Z"),
    };
    expect(oneOffTimeLeft(day, new Date("2026-11-21T18:00:00Z"), bounds)).toBe(0.25);
  });
});
