import { describe, expect, it } from "vitest";
import { programCycle } from "../cycle";
import { type ProgramItemLike, type SessionLike, suggestNextWorkout } from "../next-workout";

function items(...routineIds: (string | null)[]): ProgramItemLike[] {
  return routineIds.map((routineId, position) => ({
    routineId,
    position,
    weekday: null,
    deletedAt: null,
  }));
}

function done(routineId: string, endedAt: Date): SessionLike {
  return { routineId, startedAt: endedAt, endedAt, deletedAt: null };
}

// 2026-09-22 is a Tuesday (weekday 2).
const TUESDAY = new Date(2026, 8, 22, 9, 0);
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

function sequenceCycle(list: ProgramItemLike[], sessions: SessionLike[]) {
  const next = suggestNextWorkout({ mode: "sequence", items: list, sessions, now: TUESDAY });
  return programCycle({
    mode: "sequence",
    items: list,
    next,
    now: TUESDAY,
    weekdayOrder: MONDAY_FIRST,
  });
}

describe("programCycle — sequence", () => {
  it("puts today on the first workout with no history", () => {
    const cycle = sequenceCycle(items("a", "b", null), []);
    expect(cycle.todayIndex).toBe(0);
    expect(cycle.days.map((day) => day.state)).toEqual(["today", "upcoming", "upcoming"]);
    expect(cycle.days[2]?.routineIds).toEqual([]);
  });

  it("marks steps before the suggested workout as past", () => {
    const cycle = sequenceCycle(items("a", "b", "c"), [done("a", new Date(2026, 8, 20, 18))]);
    expect(cycle.days.map((day) => day.state)).toEqual(["past", "today", "upcoming"]);
  });

  it("lands today on the rest day being taken", () => {
    // Legs yesterday, then one rest day: today is the rest, Upper is tomorrow.
    const list = items("push", "pull", "legs", null, "upper");
    const cycle = sequenceCycle(list, [done("legs", new Date(2026, 8, 21, 18))]);
    expect(cycle.todayIndex).toBe(3);
    expect(cycle.days[3]?.state).toBe("today");
    expect(cycle.days[4]?.state).toBe("upcoming");
  });

  it("has no today when nothing is suggested", () => {
    const cycle = programCycle({
      mode: "sequence",
      items: items(null),
      next: null,
      now: TUESDAY,
      weekdayOrder: MONDAY_FIRST,
    });
    expect(cycle.todayIndex).toBe(-1);
    expect(cycle.days.map((day) => day.state)).toEqual(["upcoming"]);
  });
});

describe("programCycle — weekly", () => {
  it("lays the week out from the first weekday with today marked", () => {
    const list: ProgramItemLike[] = [
      { routineId: "a", position: 0, weekday: 1, deletedAt: null },
      { routineId: "b", position: 1, weekday: 4, deletedAt: null },
      { routineId: null, position: 2, weekday: 2, deletedAt: null },
    ];
    const cycle = programCycle({
      mode: "weekly",
      items: list,
      next: null,
      now: TUESDAY,
      weekdayOrder: MONDAY_FIRST,
    });
    expect(cycle.todayIndex).toBe(1);
    expect(cycle.days.map((day) => day.weekday)).toEqual(MONDAY_FIRST);
    expect(cycle.days[0]).toEqual({ routineIds: ["a"], weekday: 1, state: "past" });
    expect(cycle.days[1]).toEqual({ routineIds: [], weekday: 2, state: "today" });
    expect(cycle.days[3]?.routineIds).toEqual(["b"]);
  });
});
