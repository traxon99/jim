import type {
  ExerciseRow,
  PersonalRecordRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
} from "@/lib/db/schema";
import type { PersonalRecordEntry } from "@jim/core";
import { describe, expect, it } from "vitest";
import {
  buildPersonalRecordEntries,
  buildPrGroups,
  filterPrGroups,
  prFilterOptions,
} from "../pr-groups";

const NOW = new Date("2026-03-20T12:00:00Z");

const bench = {
  id: "bench",
  slug: "barbell-bench-press-medium-grip",
  name: "Bench Press",
  aliases: [],
  ownerId: null,
  isArchived: false,
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps"],
  equipment: "barbell",
  category: "strength",
  trackingType: "weight_reps",
} as unknown as ExerciseRow;
const pullup = {
  ...bench,
  id: "pullup",
  slug: "pullups",
  name: "Pull-up",
  primaryMuscles: ["lats"],
  secondaryMuscles: [],
  equipment: "body only",
  trackingType: "bodyweight",
} as unknown as ExerciseRow;

function entry(overrides: Partial<PersonalRecordEntry>): PersonalRecordEntry {
  return {
    id: "pr",
    exerciseId: "bench",
    kind: "1rm",
    value: 250,
    achievedAt: new Date("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

describe("buildPersonalRecordEntries", () => {
  it("drops PRs from deleted workouts and stale reps-at-weight rows on loaded lifts", () => {
    const records = [
      { id: "kept", exerciseId: "bench", kind: "1rm", value: "250.00", setId: "set-1" },
      { id: "deleted-workout", exerciseId: "bench", kind: "1rm", value: "260.00", setId: "set-2" },
      {
        id: "stale-reps",
        exerciseId: "bench",
        kind: "reps_at_weight",
        value: "8.00",
        setId: "set-1",
      },
      {
        id: "pullup-reps",
        exerciseId: "pullup",
        kind: "reps_at_weight",
        value: "12.00",
        setId: null,
      },
      {
        id: "tombstone",
        exerciseId: "bench",
        kind: "1rm",
        value: "300.00",
        setId: null,
        deletedAt: new Date(),
      },
    ].map((record) => ({
      deletedAt: null,
      achievedAt: NOW,
      ...record,
    })) as PersonalRecordRow[];
    const sessions = [
      { id: "s1", deletedAt: null },
      { id: "s2", deletedAt: new Date() },
    ] as SessionRow[];
    const sessionExercises = [
      { id: "se1", sessionId: "s1", deletedAt: null },
      { id: "se2", sessionId: "s2", deletedAt: null },
    ] as SessionExerciseRow[];
    const sets = [
      { id: "set-1", sessionExerciseId: "se1" },
      { id: "set-2", sessionExerciseId: "se2" },
    ] as SetRow[];

    const entries = buildPersonalRecordEntries(records, sessions, sessionExercises, sets, [
      bench,
      pullup,
    ]);
    expect(entries.map((e) => e.id).sort()).toEqual(["kept", "pullup-reps"]);
    expect(entries.find((e) => e.id === "kept")?.value).toBe(250);
  });
});

describe("buildPrGroups", () => {
  const entries = [
    entry({ id: "a", value: 225, achievedAt: new Date("2025-12-01T12:00:00Z") }),
    entry({ id: "b", value: 250, achievedAt: new Date("2026-03-18T12:00:00Z") }),
    entry({ id: "w", kind: "weight", value: 230 }),
    entry({ id: "p", exerciseId: "pullup", kind: "reps_at_weight", value: 12 }),
  ];

  it("leads with e1RM, medals barbell plates and traces the climb", () => {
    const groups = buildPrGroups({
      entries,
      exercises: [bench, pullup],
      strengthProfile: null,
      bodyweightAt: () => null,
      units: "lb",
      now: NOW,
    });
    expect(groups.map((g) => g.name)).toEqual(["Bench Press", "Pull-up"]);
    const benchGroup = groups[0];
    expect(benchGroup?.headlineRecord.id).toBe("b");
    expect(benchGroup?.headline).toBe(250);
    expect(benchGroup?.plates).toBe(2);
    expect(benchGroup?.progression.map((p) => p.value)).toEqual([225, 250]);
    expect(benchGroup?.hasRecent).toBe(true);
    expect(benchGroup?.standard).toBeNull();
    expect(groups[1]?.headline).toBeNull();
  });

  it("judges the tier at the bodyweight that applied when the e1RM was set", () => {
    const [benchGroup] = buildPrGroups({
      entries,
      exercises: [bench],
      strengthProfile: { sex: "male", bodyweight: 300, age: null },
      bodyweightAt: () => 150,
      units: "lb",
      now: NOW,
    });
    const atToday = buildPrGroups({
      entries,
      exercises: [bench],
      strengthProfile: { sex: "male", bodyweight: 300, age: null },
      bodyweightAt: () => null,
      units: "lb",
      now: NOW,
    })[0];
    expect(benchGroup?.standard).not.toBeNull();
    expect(benchGroup?.standard?.thresholds.beginner).toBeLessThan(
      atToday?.standard?.thresholds.beginner ?? 0,
    );
  });
});

describe("filterPrGroups", () => {
  const groups = [
    { exerciseId: "bench", name: "Bench Press", latestAt: new Date("2026-01-01"), headline: 250 },
    { exerciseId: "pullup", name: "Pull-up", latestAt: new Date("2026-03-01"), headline: null },
  ];

  it("sorts, searches and filters by muscle and equipment", () => {
    const base = { query: "", muscle: "", equipment: "" };
    expect(
      filterPrGroups(groups, [bench, pullup], { ...base, sortKey: "recent" }).map(
        (g) => g.exerciseId,
      ),
    ).toEqual(["pullup", "bench"]);
    expect(
      filterPrGroups(groups, [bench, pullup], { ...base, sortKey: "heaviest" }).map(
        (g) => g.exerciseId,
      ),
    ).toEqual(["bench", "pullup"]);
    expect(
      filterPrGroups(groups, [bench, pullup], { ...base, query: "bench", sortKey: "name" }).map(
        (g) => g.exerciseId,
      ),
    ).toEqual(["bench"]);
    expect(
      filterPrGroups(groups, [bench, pullup], { ...base, muscle: "triceps", sortKey: "name" }).map(
        (g) => g.exerciseId,
      ),
    ).toEqual(["bench"]);
    expect(
      filterPrGroups(groups, [bench, pullup], {
        ...base,
        equipment: "body only",
        sortKey: "name",
      }).map((g) => g.exerciseId),
    ).toEqual(["pullup"]);
  });

  it("offers only the muscles and equipment of exercises with PRs", () => {
    expect(prFilterOptions([bench, pullup])).toEqual({
      muscleOptions: ["chest", "lats", "triceps"],
      equipmentOptions: ["barbell", "body only"],
    });
  });
});
