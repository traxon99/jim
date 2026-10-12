import type { PersonalRecordEntry } from "@jim/core";
import { describe, expect, it } from "vitest";
import type { PortalRecordExercise } from "../records-data";
import { buildStandardRows, ladderPosition, loadableAtLeast } from "../standards-data";

function exercise(id: string, slug: string | null, name: string): PortalRecordExercise {
  return {
    id,
    slug,
    name,
    aliases: [],
    ownerId: null,
    isArchived: false,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: "barbell",
    category: "strength",
    trackingType: "weight_reps",
    machineBrand: null,
    machineModel: null,
  } as PortalRecordExercise;
}

function oneRepMax(exerciseId: string, value: number, day: number): PersonalRecordEntry {
  return {
    id: `${exerciseId}-${day}`,
    exerciseId,
    kind: "1rm",
    value,
    achievedAt: new Date(2026, 2, day),
  } as PersonalRecordEntry;
}

const exercises = [
  exercise("squat", "barbell-squat", "Barbell Squat"),
  exercise("bench", "barbell-bench-press-medium-grip", "Barbell Bench Press - Medium Grip"),
  exercise("curl", "barbell-curl", "Barbell Curl"),
];
// 200 lb male lifter in his prime: squat Intermediate starts at 300, Advanced at 350.
const profile = { sex: "male" as const, bodyweight: 200, age: 30 };

describe("buildStandardRows", () => {
  const rows = buildStandardRows({
    entries: [oneRepMax("squat", 280, 1), oneRepMax("squat", 320, 9), oneRepMax("curl", 120, 9)],
    exercises,
    profile,
    barWeight: 45,
    plates: [45, 25, 10, 5, 2.5],
  });

  it("lists the four standard lifts in order, whether or not they're logged", () => {
    expect(rows.map((row) => row.lift)).toEqual([
      "squat",
      "benchPress",
      "deadlift",
      "overheadPress",
    ]);
  });

  it("places a lift's best e1RM and says what the next tier takes", () => {
    const squat = rows[0];
    expect(squat).toMatchObject({
      exerciseId: "squat",
      name: "Barbell Squat",
      oneRepMax: 320,
      ratio: 1.6,
      tier: "intermediate",
      thresholds: { intermediate: 300, advanced: 350 },
    });
    expect(squat?.next?.tier).toBe("advanced");
    expect(squat?.next?.oneRepMax).toBe(350);
    expect(squat?.next?.toGo).toBe(30);
    // 350 / (1 + 5/30) = 300 exactly: the bar plus 45, 45, 25, 10 and 2.5 a side.
    expect(squat?.next?.workingWeight).toBe(300);
  });

  it("starts an unlogged lift at Beginner, with its exercise when one exists", () => {
    const bench = rows[1];
    expect(bench).toMatchObject({ exerciseId: "bench", oneRepMax: null, tier: null });
    expect(bench?.next).toMatchObject({ tier: "beginner", oneRepMax: 100, toGo: 100 });
    expect(rows[2]).toMatchObject({ exerciseId: null, name: null, oneRepMax: null });
  });

  it("has no next tier past Elite", () => {
    const [squat] = buildStandardRows({
      entries: [oneRepMax("squat", 500, 1)],
      exercises,
      profile,
      barWeight: 45,
      plates: [45],
    });
    expect(squat?.tier).toBe("elite");
    expect(squat?.next).toBeNull();
  });

  it("rounds the suggested set up to one the bar and plates can load", () => {
    const [squat] = buildStandardRows({
      entries: [oneRepMax("squat", 320, 1)],
      exercises,
      profile: { ...profile, bodyweight: 183 },
      barWeight: 45,
      plates: [45, 10],
    });
    // Advanced is 320.25 e1RM, about 274.5 × 5; in 20 lb steps the set that reaches it is 285.
    expect(squat?.next?.workingWeight).toBe(285);
  });
});

describe("ladderPosition", () => {
  const thresholds = { beginner: 100, novice: 200, intermediate: 300, advanced: 400, elite: 500 };

  it("gives each tier an equal share of the bar", () => {
    expect(ladderPosition(null, thresholds)).toBe(0);
    expect(ladderPosition(50, thresholds)).toBeCloseTo(0.1);
    expect(ladderPosition(100, thresholds)).toBeCloseTo(0.2);
    expect(ladderPosition(350, thresholds)).toBeCloseTo(0.7);
    expect(ladderPosition(500, thresholds)).toBe(1);
    expect(ladderPosition(900, thresholds)).toBe(1);
  });
});

describe("loadableAtLeast", () => {
  it("rounds up to the next load the plates can make", () => {
    expect(loadableAtLeast(274.5, 45, [45, 10])).toBe(285);
    expect(loadableAtLeast(275, 45, [45, 25, 10, 5, 2.5])).toBe(275);
    expect(loadableAtLeast(276, 45, [45, 25, 10, 5, 2.5])).toBe(280);
  });

  it("keeps the bar for anything lighter, and the raw weight with no plates", () => {
    expect(loadableAtLeast(30, 45, [45])).toBe(45);
    expect(loadableAtLeast(101.3, 45, [])).toBe(101.3);
  });
});
