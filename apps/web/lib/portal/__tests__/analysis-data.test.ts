import { describe, expect, it } from "vitest";
import { isInstallGateExempt } from "../../pwa/install-gate-exempt";
import { buildPortalSets } from "../analysis-data";

const COMPLETED_AT = new Date("2026-03-02T18:00:00.000Z");

function setRow(overrides: Partial<Parameters<typeof buildPortalSets>[3][number]> = {}) {
  return {
    id: "set-1",
    sessionExerciseId: "se-1",
    kind: "working",
    weight: "225.00",
    reps: 5,
    completedAt: COMPLETED_AT,
    supersedesId: null,
    deletedAt: null,
    ...overrides,
  };
}

const sessions = [
  { id: "session-1", deletedAt: null },
  { id: "session-deleted", deletedAt: new Date() },
];
const sessionExercises = [
  { id: "se-1", sessionId: "session-1", exerciseId: "bench", deletedAt: null },
  { id: "se-warmup", sessionId: "session-1", exerciseId: "arm-circles", deletedAt: null },
  { id: "se-removed", sessionId: "session-1", exerciseId: "bench", deletedAt: new Date() },
  { id: "se-in-deleted", sessionId: "session-deleted", exerciseId: "squat", deletedAt: null },
];
const exercises = [
  { id: "bench", name: "Bench Press", category: "strength" as const },
  { id: "squat", name: "Squat", category: "strength" as const },
  { id: "arm-circles", name: "Arm Circles", category: "warmup" as const },
  { id: "unused", name: "Unused", category: "strength" as const },
];

describe("buildPortalSets", () => {
  it("keeps current working sets, with numeric weight and ISO dates", () => {
    const result = buildPortalSets(sessions, sessionExercises, exercises, [setRow()]);
    expect(result.sets).toEqual([
      {
        exerciseId: "bench",
        sessionId: "session-1",
        completedAt: COMPLETED_AT.toISOString(),
        weight: 225,
        reps: 5,
      },
    ]);
    expect(result.exercises).toEqual([{ id: "bench", name: "Bench Press" }]);
  });

  it("resolves supersede chains to the latest edit", () => {
    const result = buildPortalSets(sessions, sessionExercises, exercises, [
      setRow({ id: "original", weight: "200" }),
      setRow({ id: "edit", weight: "205", supersedesId: "original" }),
    ]);
    expect(result.sets.map((set) => set.weight)).toEqual([205]);
  });

  it("drops deleted sets, warm-up sets, warm-up exercises, and removed or deleted parents", () => {
    const result = buildPortalSets(sessions, sessionExercises, exercises, [
      setRow({ id: "deleted", deletedAt: new Date() }),
      setRow({ id: "warmup-set", kind: "warmup" }),
      setRow({ id: "warmup-exercise", sessionExerciseId: "se-warmup" }),
      setRow({ id: "removed", sessionExerciseId: "se-removed" }),
      setRow({ id: "in-deleted", sessionExerciseId: "se-in-deleted" }),
    ]);
    expect(result.sets).toEqual([]);
    expect(result.exercises).toEqual([]);
  });
});

describe("isInstallGateExempt", () => {
  it("lets the portal and sign-in on the way to it through, and nothing else", () => {
    expect(isInstallGateExempt("/portal", "")).toBe(true);
    expect(isInstallGateExempt("/login", "?next=%2Fportal")).toBe(true);
    expect(isInstallGateExempt("/signup", "?next=/portal")).toBe(true);
    expect(isInstallGateExempt("/login", "?next=/")).toBe(false);
    expect(isInstallGateExempt("/login", "?next=/portalfoo")).toBe(false);
    expect(isInstallGateExempt("/portalfoo", "")).toBe(false);
    expect(isInstallGateExempt("/history", "")).toBe(false);
  });
});
