import type { CycleDay, ProgramCycle } from "@jim/core";
import { describe, expect, it } from "vitest";
import { MAX_PROGRAM_DAY_ROWS, programDayRows } from "../program-day-rows";

// Friday 2026-11-13, a Monday-first week: Mon Pull, Wed Legs, Fri Push.
const today = new Date(2026, 10, 13, 9);

function weekly(): ProgramCycle {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const routines: Record<number, string[]> = { 1: ["pull"], 3: ["legs"], 5: ["push"] };
  const days: CycleDay[] = order.map((weekday, index) => ({
    weekday,
    routineIds: routines[weekday] ?? [],
    state: index < 4 ? "past" : index === 4 ? "today" : "upcoming",
  }));
  return { days, todayIndex: 4 };
}

const session = (routineId: string, date: Date) => ({
  routineId,
  startedAt: date,
  endedAt: new Date(date.getTime() + 3_600_000),
  deletedAt: null,
});

describe("programDayRows", () => {
  it("marks a weekly day done only when its routine was finished on that date", () => {
    const rows = programDayRows({
      cycle: weekly(),
      mode: "weekly",
      today,
      sessions: [
        session("pull", new Date(2026, 10, 9, 18)), // Monday: done
        session("pull", new Date(2026, 10, 11, 18)), // Wednesday, but Wednesday is Legs
        session("push", new Date(2026, 10, 6, 18)), // last Friday, not this one
      ],
    });
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.done)).toEqual([true, false, false, false, false, false, false]);
    expect(rows[4]?.isToday).toBe(true);
  });

  it("ignores unfinished and deleted workouts", () => {
    const rows = programDayRows({
      cycle: weekly(),
      mode: "weekly",
      today,
      sessions: [
        { ...session("pull", new Date(2026, 10, 9, 18)), endedAt: null },
        { ...session("legs", new Date(2026, 10, 11, 18)), deletedAt: new Date() },
      ],
    });
    expect(rows.some((row) => row.done)).toBe(false);
  });

  it("counts a rotation's past days as done", () => {
    const days: CycleDay[] = ["a", "b", "c"].map((id, index) => ({
      weekday: null,
      routineIds: [id],
      state: index === 0 ? "past" : index === 1 ? "today" : "upcoming",
    }));
    const rows = programDayRows({
      cycle: { days, todayIndex: 1 },
      mode: "sequence",
      today,
      sessions: [],
    });
    expect(rows.map((row) => row.done)).toEqual([true, false, false]);
  });

  it("windows a long rotation to seven rows around today", () => {
    const days: CycleDay[] = Array.from({ length: 12 }, (_, index) => ({
      weekday: null,
      routineIds: [`r${index}`],
      state: index < 9 ? "past" : index === 9 ? "today" : "upcoming",
    }));
    const rows = programDayRows({
      cycle: { days, todayIndex: 9 },
      mode: "sequence",
      today,
      sessions: [],
    });
    expect(rows).toHaveLength(MAX_PROGRAM_DAY_ROWS);
    expect(rows.map((row) => row.index)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(rows.find((row) => row.isToday)?.index).toBe(9);
  });

  it("starts the window at the first day when today is near the start", () => {
    const days: CycleDay[] = Array.from({ length: 10 }, (_, index) => ({
      weekday: null,
      routineIds: [`r${index}`],
      state: index === 0 ? "today" : "upcoming",
    }));
    const rows = programDayRows({
      cycle: { days, todayIndex: 0 },
      mode: "sequence",
      today,
      sessions: [],
    });
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
