import type { SessionDetailExercise, SessionDetailSet } from "@/lib/history/session-detail-entries";
import { describe, expect, it } from "vitest";
import { buildSummaryExerciseRows, formatSetsLine } from "../summary-exercises";

function set(
  id: string,
  weight: number | null,
  reps: number | null,
  extra: Partial<SessionDetailSet> = {},
): SessionDetailSet {
  return {
    id,
    setIndex: 0,
    kind: "working",
    weight,
    reps,
    durationSeconds: null,
    distance: null,
    rpe: null,
    restSeconds: null,
    restTargetSeconds: null,
    prKinds: [],
    ...extra,
  };
}

function group(id: string, name: string, sets: SessionDetailSet[]): SessionDetailExercise {
  return {
    sessionExerciseId: id,
    exerciseId: `ex-${id}`,
    exerciseName: name,
    isWarmup: false,
    isCardio: false,
    notes: null,
    tempo: null,
    sets,
  };
}

describe("buildSummaryExerciseRows", () => {
  it("keeps workout order and picks the heaviest set, then the most reps", () => {
    const rows = buildSummaryExerciseRows([
      group("se1", "Bench Press", [set("a", 185, 5), set("b", 195, 3), set("c", 195, 4)]),
      group("se2", "Pull-up", [set("d", null, 8), set("e", null, 12)]),
    ]);
    expect(rows.map((row) => [row.exerciseName, row.setCount, row.bestSet])).toEqual([
      ["Bench Press", 3, "195 × 4"],
      ["Pull-up", 2, "× 12"],
    ]);
  });

  it("ignores warm-ups unless they are all the exercise has", () => {
    const rows = buildSummaryExerciseRows([
      group("se1", "Squat", [set("w", 135, 10, { kind: "warmup" }), set("a", 225, 5)]),
      group("se2", "Curl", [set("w2", 20, 15, { kind: "warmup" })]),
    ]);
    expect(rows.map((row) => [row.setCount, row.bestSet])).toEqual([
      [1, "225 × 5"],
      [1, "20 × 15"],
    ]);
  });

  it("collects each PR kind once, including ones hit on warm-ups", () => {
    const rows = buildSummaryExerciseRows([
      group("se1", "Deadlift", [
        set("a", 315, 5, { prKinds: ["weight", "1rm"] }),
        set("b", 315, 6, { prKinds: ["1rm", "reps_at_weight"] }),
      ]),
    ]);
    expect(rows[0].prKinds).toEqual(["weight", "1rm", "reps_at_weight"]);
  });

  it("formats timed sets and skips exercises with nothing logged", () => {
    const rows = buildSummaryExerciseRows([
      group("se1", "Plank", [
        set("a", null, null, { durationSeconds: 45 }),
        set("b", null, null, { durationSeconds: 60 }),
      ]),
      group("se2", "Skipped", []),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].bestSet).toBe("1:00");
  });

  it("picks cardio's longest distance and shows it with its time", () => {
    const rows = buildSummaryExerciseRows(
      [
        group("se1", "Running (Outdoor)", [
          set("a", null, null, { distance: 3, durationSeconds: 1000 }),
          set("b", null, null, { distance: 5, durationSeconds: 1500 }),
        ]),
      ],
      "km",
    );
    expect(rows[0].bestSet).toBe("5 km · 25:00");
  });
});

describe("formatSetsLine", () => {
  it("shares a weight across consecutive sets and breaks where it changes", () => {
    expect(formatSetsLine([set("a", 195, 8), set("b", 195, 8), set("c", 195, 7)])).toBe(
      "195 × 8, 8, 7",
    );
    expect(formatSetsLine([set("a", 185, 8), set("b", 195, 6)])).toBe("185 × 8 · 195 × 6");
    expect(formatSetsLine([set("a", 62.5, 10), set("b", 62.5, 9)])).toBe("62.5 × 10, 9");
  });

  it("writes bodyweight sets as reps only, and leaves timed sets to the best set", () => {
    expect(formatSetsLine([set("a", null, 12), set("b", 0, 10)])).toBe("× 12, 10");
    expect(formatSetsLine([set("a", null, null, { durationSeconds: 60 })])).toBeNull();
    expect(
      formatSetsLine([set("a", null, null, { distance: 5, durationSeconds: 1500 })]),
    ).toBeNull();
  });

  it("feeds the summary row, with the best set as the fallback", () => {
    const rows = buildSummaryExerciseRows([
      group("se1", "Bench Press", [set("a", 195, 8), set("b", 195, 7)]),
      group("se2", "Plank", [set("p", null, null, { durationSeconds: 60 })]),
    ]);
    expect(rows.map((row) => row.setsLine)).toEqual(["195 × 8, 7", "1:00"]);
  });
});
