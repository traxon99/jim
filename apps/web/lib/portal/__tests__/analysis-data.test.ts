import { describe, expect, it } from "vitest";
import { isInstallGateExempt, safeNextPath } from "../../pwa/install-gate-exempt";
import { buildPortalGyms, buildPortalSets, countGymVisits } from "../analysis-data";

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

describe("buildPortalSets — machine names (#460)", () => {
  it("names an exercise with its machine make and model", () => {
    const result = buildPortalSets(
      sessions,
      sessionExercises,
      [{ ...exercises[0], machineBrand: "Hammer Strength", machineModel: "Incline" }],
      [setRow()],
    );
    expect(result.exercises).toEqual([
      { id: "bench", name: "Bench Press (Hammer Strength Incline)" },
    ]);
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

  it("lets password recovery through from any browser (#444)", () => {
    expect(isInstallGateExempt("/forgot-password", "")).toBe(true);
    expect(isInstallGateExempt("/reset-password", "next=%2Fportal")).toBe(true);
    expect(isInstallGateExempt("/auth/auth-code-error", "")).toBe(true);
    expect(isInstallGateExempt("/forgot-passwordx", "")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths and drops anything else", () => {
    expect(safeNextPath("/portal")).toBe("/portal");
    expect(safeNextPath("/reset-password?next=%2Fportal")).toBe("/reset-password?next=%2Fportal");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(["/portal"])).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });
});

describe("buildPortalGyms (#462)", () => {
  const gym = {
    name: "Iron Temple",
    address: "1 Main St",
    latitude: 39.8,
    longitude: -89.65,
    isDefault: true,
    deletedAt: null,
  };
  const at = (iso: string) => new Date(iso);

  it("keeps live, pinned gyms and the finished workouts at them", () => {
    const result = buildPortalGyms(
      [
        { ...gym, id: "pinned" },
        { ...gym, id: "typed", latitude: null, longitude: null },
        { ...gym, id: "gone", deletedAt: at("2026-01-01T00:00:00Z") },
      ],
      [
        {
          gymId: "pinned",
          startedAt: at("2026-03-01T10:00:00Z"),
          endedAt: at("2026-03-01T11:00:00Z"),
          deletedAt: null,
        },
        { gymId: "pinned", startedAt: at("2026-03-02T10:00:00Z"), endedAt: null, deletedAt: null },
        {
          gymId: "pinned",
          startedAt: at("2026-03-03T10:00:00Z"),
          endedAt: at("2026-03-03T11:00:00Z"),
          deletedAt: at("2026-03-04T00:00:00Z"),
        },
        {
          gymId: "typed",
          startedAt: at("2026-03-05T10:00:00Z"),
          endedAt: at("2026-03-05T11:00:00Z"),
          deletedAt: null,
        },
        {
          gymId: null,
          startedAt: at("2026-03-06T10:00:00Z"),
          endedAt: at("2026-03-06T11:00:00Z"),
          deletedAt: null,
        },
      ],
    );
    expect(result.gyms).toEqual([
      {
        id: "pinned",
        name: "Iron Temple",
        address: "1 Main St",
        latitude: 39.8,
        longitude: -89.65,
        isHome: true,
      },
    ]);
    expect(result.gymVisits).toEqual([{ gymId: "pinned", startedAt: "2026-03-01T10:00:00.000Z" }]);
  });

  it("counts visits per gym within the range", () => {
    const visits = [
      { gymId: "a", startedAt: "2026-01-01T00:00:00.000Z" },
      { gymId: "a", startedAt: "2026-03-01T00:00:00.000Z" },
      { gymId: "b", startedAt: "2026-03-02T00:00:00.000Z" },
    ];
    expect(countGymVisits(visits, null)).toEqual(
      new Map([
        ["a", 2],
        ["b", 1],
      ]),
    );
    expect(countGymVisits(visits, new Date("2026-02-01T00:00:00Z"))).toEqual(
      new Map([
        ["a", 1],
        ["b", 1],
      ]),
    );
  });
});
