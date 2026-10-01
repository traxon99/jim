import { describe, expect, it } from "vitest";
import { type ProgramItemLike, type SessionLike, suggestNextWorkout } from "../next-workout";

/** `null` entries are rest days. */
function items(...routineIds: (string | null)[]): ProgramItemLike[] {
  return routineIds.map((routineId, position) => ({
    routineId,
    position,
    weekday: null,
    deletedAt: null,
  }));
}

function weekly(...entries: [string | null, number][]): ProgramItemLike[] {
  return entries.map(([routineId, weekday], position) => ({
    routineId,
    position,
    weekday,
    deletedAt: null,
  }));
}

function done(routineId: string | null, endedAt: string): SessionLike {
  const end = new Date(endedAt);
  return {
    routineId,
    startedAt: new Date(end.getTime() - 3600_000),
    endedAt: end,
    deletedAt: null,
  };
}

// 2026-09-22 is a Tuesday (weekday 2).
const TUESDAY = new Date(2026, 8, 22, 9, 0);

describe("suggestNextWorkout — sequence", () => {
  const base = { mode: "sequence" as const, now: TUESDAY };

  it("starts at the first routine with no history", () => {
    const result = suggestNextWorkout({ ...base, items: items("a", "b", "c"), sessions: [] });
    expect(result).toMatchObject({
      routineId: "a",
      reason: "sequence",
      date: null,
      doneToday: false,
    });
  });

  it("suggests the routine after the last completed one", () => {
    const sessions = [done("a", "2026-09-18T10:00"), done("b", "2026-09-20T10:00")];
    const result = suggestNextWorkout({ ...base, items: items("a", "b", "c"), sessions });
    expect(result?.routineId).toBe("c");
  });

  it("wraps around after the last routine", () => {
    const sessions = [done("c", "2026-09-20T10:00")];
    const result = suggestNextWorkout({ ...base, items: items("a", "b", "c"), sessions });
    expect(result?.routineId).toBe("a");
  });

  it("ignores in-progress, deleted and out-of-program sessions", () => {
    const sessions: SessionLike[] = [
      done("a", "2026-09-19T10:00"),
      done("x", "2026-09-20T10:00"),
      { ...done("b", "2026-09-21T10:00"), deletedAt: new Date() },
      { routineId: "c", startedAt: TUESDAY, endedAt: null, deletedAt: null },
    ];
    const result = suggestNextWorkout({ ...base, items: items("a", "b", "c"), sessions });
    expect(result?.routineId).toBe("b");
  });

  it("disambiguates a routine that appears twice using the session before it", () => {
    const program = items("a", "b", "a", "c");
    const afterSecondA = [done("b", "2026-09-19T10:00"), done("a", "2026-09-20T10:00")];
    expect(suggestNextWorkout({ ...base, items: program, sessions: afterSecondA })?.item).toBe(
      program[3],
    );
    const afterFirstA = [done("c", "2026-09-19T10:00"), done("a", "2026-09-20T10:00")];
    expect(suggestNextWorkout({ ...base, items: program, sessions: afterFirstA })?.item).toBe(
      program[1],
    );
  });

  it("skips removed program entries and honours position order", () => {
    const program: ProgramItemLike[] = [
      { routineId: "b", position: 1, weekday: null, deletedAt: null },
      { routineId: "a", position: 0, weekday: null, deletedAt: null },
      { routineId: "gone", position: 2, weekday: null, deletedAt: new Date() },
    ];
    const result = suggestNextWorkout({
      ...base,
      items: program,
      sessions: [done("b", "2026-09-20")],
    });
    expect(result?.routineId).toBe("a");
  });

  it("returns null for an empty program", () => {
    expect(suggestNextWorkout({ ...base, items: [], sessions: [] })).toBeNull();
  });

  describe("rest days", () => {
    const program = items("a", null, "b", "c");

    it("starts on the first workout, skipping a leading rest day", () => {
      const result = suggestNextWorkout({ ...base, items: items(null, "a"), sessions: [] });
      expect(result?.routineId).toBe("a");
      expect(result?.reason).toBe("sequence");
    });

    it("rests the day after the workout before it, naming what comes next", () => {
      const result = suggestNextWorkout({
        ...base,
        items: program,
        sessions: [done("a", "2026-09-21T18:00")],
      });
      expect(result).toMatchObject({
        routineId: "b",
        reason: "rest",
        date: new Date(2026, 8, 23),
        doneToday: false,
      });
    });

    it("already shows the rest day on the evening of the workout", () => {
      const result = suggestNextWorkout({
        ...base,
        items: program,
        sessions: [done("a", "2026-09-22T07:00")],
      });
      expect(result?.reason).toBe("rest");
      expect(result?.date).toEqual(new Date(2026, 8, 24));
    });

    it("continues the program once the rest day has passed", () => {
      const result = suggestNextWorkout({
        ...base,
        items: program,
        sessions: [done("a", "2026-09-20T10:00")],
      });
      expect(result).toMatchObject({ routineId: "b", reason: "sequence", date: null });
    });

    it("spends one day per rest day in a row", () => {
      const twoRests = items("a", null, null, "b");
      const sessions = [done("a", "2026-09-20T10:00")];
      expect(suggestNextWorkout({ ...base, items: twoRests, sessions })).toMatchObject({
        routineId: "b",
        reason: "rest",
        date: new Date(2026, 8, 23),
      });
    });

    it("moves on if you train through the rest day", () => {
      const sessions = [done("a", "2026-09-21T10:00"), done("b", "2026-09-22T08:00")];
      const result = suggestNextWorkout({ ...base, items: program, sessions });
      expect(result).toMatchObject({ routineId: "c", reason: "sequence" });
    });

    it("rests after the last routine before wrapping around", () => {
      const result = suggestNextWorkout({
        ...base,
        items: items("a", "b", null),
        sessions: [done("b", "2026-09-21T10:00")],
      });
      expect(result).toMatchObject({ routineId: "a", reason: "rest" });
    });

    it("tells repeated routines apart across a rest day", () => {
      const abRestA = items("a", "b", null, "a", "c");
      const sessions = [done("b", "2026-09-15T10:00"), done("a", "2026-09-17T10:00")];
      expect(suggestNextWorkout({ ...base, items: abRestA, sessions })?.routineId).toBe("c");
    });

    it("returns null for a program of only rest days", () => {
      expect(suggestNextWorkout({ ...base, items: items(null, null), sessions: [] })).toBeNull();
    });
  });
});

describe("suggestNextWorkout — weekly", () => {
  const base = { mode: "weekly" as const, now: TUESDAY };

  it("suggests today's scheduled routine", () => {
    const result = suggestNextWorkout({
      ...base,
      items: weekly(["push", 1], ["pull", 2], ["legs", 4]),
      sessions: [],
    });
    expect(result).toMatchObject({
      routineId: "pull",
      reason: "scheduled-today",
      date: new Date(2026, 8, 22),
      doneToday: false,
    });
  });

  it("moves to the next scheduled day once today's is done", () => {
    const result = suggestNextWorkout({
      ...base,
      items: weekly(["push", 1], ["pull", 2], ["legs", 4]),
      sessions: [done("pull", "2026-09-22T08:30")],
    });
    expect(result).toMatchObject({
      routineId: "legs",
      reason: "next-scheduled",
      date: new Date(2026, 8, 24),
      doneToday: true,
    });
  });

  it("suggests the next scheduled day on a rest day, wrapping into next week", () => {
    const result = suggestNextWorkout({ ...base, items: weekly(["push", 1]), sessions: [] });
    expect(result).toMatchObject({
      routineId: "push",
      reason: "next-scheduled",
      date: new Date(2026, 8, 28),
      doneToday: false,
    });
  });

  it("walks through several routines scheduled on the same day", () => {
    const result = suggestNextWorkout({
      ...base,
      items: weekly(["run", 2], ["abs", 2]),
      sessions: [done("run", "2026-09-22T07:00")],
    });
    expect(result?.routineId).toBe("abs");
    expect(result?.reason).toBe("scheduled-today");
  });

  it("treats a pinned rest day like an unscheduled one", () => {
    const result = suggestNextWorkout({
      ...base,
      items: weekly(["push", 1], [null, 2], ["legs", 4]),
      sessions: [],
    });
    expect(result).toMatchObject({
      routineId: "legs",
      reason: "next-scheduled",
      date: new Date(2026, 8, 24),
      doneToday: false,
    });
  });

  it("returns null when nothing has a weekday", () => {
    expect(suggestNextWorkout({ ...base, items: items("a"), sessions: [] })).toBeNull();
  });
});
