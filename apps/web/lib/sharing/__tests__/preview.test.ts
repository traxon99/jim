import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/user-scoped", () => ({ serviceDb: vi.fn() }));

import { sharePreviewDescription } from "../preview";

describe("sharePreviewDescription", () => {
  it("says what a routine is, who shared it and what's in it", () => {
    expect(
      sharePreviewDescription({
        username: "jackson",
        summary: {
          kind: "routine",
          name: "Push",
          exercises: 5,
          sets: 15,
          minutes: 55,
          exerciseNames: ["Bench Press", "Incline Press", "Dips", "Flyes", "Pushdown"],
        },
      }),
    ).toBe(
      "Routine shared by jackson: ~55 min · 5 exercises · 15 sets. Bench Press, Incline Press, Dips, Flyes, Pushdown.",
    );
  });

  it("names the first six exercises of a long routine", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    expect(
      sharePreviewDescription({
        username: null,
        summary: {
          kind: "routine",
          name: "Full body",
          exercises: 8,
          sets: 0,
          minutes: null,
          exerciseNames: names,
        },
      }),
    ).toBe("Routine: 8 exercises. A, B, C, D, E, F +2 more.");
  });

  it("describes a program by its weeks, days and sessions", () => {
    expect(
      sharePreviewDescription({
        username: null,
        summary: {
          kind: "program",
          name: "PPL",
          routines: 3,
          workouts: 6,
          mode: "weekly",
          weeks: 8,
          minutes: 60,
          routineNames: ["Push", "Pull", "Legs"],
        },
      }),
    ).toBe("Program: 8 weeks · 6× a week · ~60 min sessions. Push, Pull, Legs.");
  });
});
