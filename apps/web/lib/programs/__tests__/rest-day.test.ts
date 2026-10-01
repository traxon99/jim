import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRestDay, localDateKey, readRestDaySkipped, writeRestDaySkipped } from "../rest-day";

describe("isRestDay", () => {
  it("is a rest day while a sequence rests", () => {
    expect(isRestDay({ reason: "rest", doneToday: false })).toBe(true);
  });

  it("is a rest day on a weekly day with nothing scheduled", () => {
    expect(isRestDay({ reason: "next-scheduled", doneToday: false })).toBe(true);
  });

  it("isn't a rest day once today's weekly workouts are done", () => {
    expect(isRestDay({ reason: "next-scheduled", doneToday: true })).toBe(false);
  });

  it("isn't a rest day when a workout is due", () => {
    expect(isRestDay({ reason: "sequence", doneToday: false })).toBe(false);
    expect(isRestDay({ reason: "scheduled-today", doneToday: false })).toBe(false);
  });
});

describe("rest day skip", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const monday = new Date(2026, 9, 5, 9, 0);
  const lateMonday = new Date(2026, 9, 5, 23, 59);
  const tuesday = new Date(2026, 9, 6, 0, 1);

  it("formats the local date", () => {
    expect(localDateKey(monday)).toBe("2026-10-05");
  });

  it("holds for the rest of the day it was skipped", () => {
    writeRestDaySkipped("p1", true, monday);
    expect(readRestDaySkipped("p1", lateMonday)).toBe(true);
  });

  it("lapses at midnight", () => {
    writeRestDaySkipped("p1", true, monday);
    expect(readRestDaySkipped("p1", tuesday)).toBe(false);
  });

  it("is per program", () => {
    writeRestDaySkipped("p1", true, monday);
    expect(readRestDaySkipped("p2", monday)).toBe(false);
  });

  it("can be undone", () => {
    writeRestDaySkipped("p1", true, monday);
    writeRestDaySkipped("p1", false, monday);
    expect(readRestDaySkipped("p1", monday)).toBe(false);
  });

  it("reads as not skipped when storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readRestDaySkipped("p1", monday)).toBe(false);
  });
});
