import type { SessionDetailExercise, SessionDetailSet } from "@/lib/history/session-detail-entries";
import type { SessionSummary } from "@jim/core";
import { describe, expect, it } from "vitest";
import { buildWorkoutShareText } from "../share-text";

function set(overrides: Partial<SessionDetailSet> = {}): SessionDetailSet {
  return {
    id: "set-1",
    setIndex: 0,
    kind: "working",
    weight: 135,
    reps: 5,
    durationSeconds: null,
    distance: null,
    prKinds: [],
    ...overrides,
  };
}

function exercise(overrides: Partial<SessionDetailExercise> = {}): SessionDetailExercise {
  return {
    sessionExerciseId: "se-1",
    exerciseId: "ex-1",
    exerciseName: "Barbell Bench Press",
    notes: null,
    sets: [set()],
    ...overrides,
  };
}

const SUMMARY: SessionSummary = {
  totalVolume: 12450,
  durationSeconds: 42 * 60,
  setCount: 18,
  prCount: 2,
};

describe("buildWorkoutShareText", () => {
  it("opens with the workout name and a stats line", () => {
    const text = buildWorkoutShareText({
      name: "Push Day",
      startedAt: new Date(2026, 8, 22),
      units: "lb",
      summary: SUMMARY,
      exercises: [],
    });

    expect(text).toBe("Push Day\nSep 22, 2026 · 42 min · 12,450 lb · 18 sets · 2 PRs");
  });

  it("falls back to 'Workout' for an untitled session", () => {
    const text = buildWorkoutShareText({
      name: null,
      startedAt: new Date(2026, 8, 22),
      units: "lb",
      summary: SUMMARY,
      exercises: [],
    });

    expect(text.split("\n")[0]).toBe("Workout");
  });

  it("singularizes the PR count", () => {
    const text = buildWorkoutShareText({
      name: "Push Day",
      startedAt: new Date(2026, 8, 22),
      units: "lb",
      summary: { ...SUMMARY, prCount: 1 },
      exercises: [],
    });

    expect(text.endsWith("1 PR")).toBe(true);
  });

  it("lists each exercise's sets on their own line, weight×reps by default", () => {
    const text = buildWorkoutShareText({
      name: "Push Day",
      startedAt: new Date(2026, 8, 22),
      units: "lb",
      summary: SUMMARY,
      exercises: [
        exercise({
          sets: [
            set({ id: "a", setIndex: 0, weight: 135, reps: 5 }),
            set({ id: "b", setIndex: 1, weight: 155, reps: 5 }),
          ],
        }),
      ],
    });

    expect(text).toContain("Barbell Bench Press\n135×5, 155×5");
  });

  it("tags a PR set and a non-working set kind", () => {
    const text = buildWorkoutShareText({
      name: "Push Day",
      startedAt: new Date(2026, 8, 22),
      units: "lb",
      summary: SUMMARY,
      exercises: [
        exercise({
          sets: [
            set({ id: "w", kind: "warmup", weight: 95, reps: 8 }),
            set({ id: "p", weight: 175, reps: 3, prKinds: ["1rm"] }),
            set({ id: "d", kind: "drop", weight: 115, reps: 8, prKinds: ["volume"] }),
          ],
        }),
      ],
    });

    expect(text).toContain("95×8 (warmup), 175×3 (PR), 115×8 (drop, PR)");
  });

  it("formats a duration-only set in seconds and a distance-only set as-is", () => {
    const text = buildWorkoutShareText({
      name: "Cardio",
      startedAt: new Date(2026, 8, 22),
      units: "lb",
      summary: SUMMARY,
      exercises: [
        exercise({
          exerciseName: "Plank",
          sets: [set({ weight: null, reps: null, durationSeconds: 45 })],
        }),
        exercise({
          exerciseName: "Rowing",
          sets: [set({ weight: null, reps: null, distance: 2.5 })],
        }),
      ],
    });

    expect(text).toContain("Plank\n45s");
    expect(text).toContain("Rowing\n2.5");
  });

  it("omits an exercise with no sets", () => {
    const text = buildWorkoutShareText({
      name: "Push Day",
      startedAt: new Date(2026, 8, 22),
      units: "lb",
      summary: SUMMARY,
      exercises: [exercise({ exerciseName: "Skipped", sets: [] }), exercise()],
    });

    expect(text).not.toContain("Skipped");
    expect(text).toContain("Barbell Bench Press");
  });
});
