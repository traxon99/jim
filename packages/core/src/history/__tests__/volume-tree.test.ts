import { describe, expect, it } from "vitest";
import { type MuscleVolumeSet, weeklyVolumeByMuscle } from "../volume-by-muscle";
import { OTHER_TARGET, volumeTreeRows } from "../volume-tree";

function set(overrides: Partial<MuscleVolumeSet>): MuscleVolumeSet {
  return {
    completedAt: new Date(2026, 0, 4),
    weight: 20,
    reps: 10,
    primaryMuscles: ["shoulders"],
    secondaryMuscles: [],
    ...overrides,
  };
}

const lateralRaise = set({ primaryTargets: ["side_delt"], secondaryTargets: [] });
const overheadPress = set({
  weight: 100,
  primaryMuscles: ["shoulders"],
  secondaryMuscles: ["triceps"],
  primaryTargets: ["front_delt"],
  secondaryTargets: ["side_delt", "triceps_brachii"],
});
const untaggedShoulders = set({ primaryTargets: [], secondaryTargets: [] });

describe("weekly sets per muscle tree node", () => {
  it("counts each node once at the highest weight under it", () => {
    const [week] = weeklyVolumeByMuscle([lateralRaise, overheadPress], 0);
    expect(week?.setsByMuscle.shoulders).toBe(2);
    expect(week?.setsByTarget).toMatchObject({
      deltoid: 2,
      side_delt: 1.5,
      front_delt: 1,
      triceps_brachii: 0.5,
    });
    // Groups stay in setsByMuscle only.
    expect(week?.setsByTarget.shoulders).toBeUndefined();
    expect(week?.volumeByTarget.front_delt).toBe(1000);
    expect(week?.volumeByTarget.side_delt).toBe(200 + 500);
  });

  it("puts work tagged no deeper than a node in that node's Other", () => {
    const [week] = weeklyVolumeByMuscle([lateralRaise, untaggedShoulders], 0);
    expect(week?.otherSetsByTarget.shoulders).toBe(1);
    // Triceps from the press reached its muscle but none of its heads.
    const [withPress] = weeklyVolumeByMuscle([overheadPress], 0);
    expect(withPress?.otherSetsByTarget.triceps_brachii).toBe(0.5);
  });

  it("breaks a group into muscles, most sets first, with Other last", () => {
    const [week] = weeklyVolumeByMuscle([lateralRaise, overheadPress, untaggedShoulders], 0);
    if (!week) throw new Error("no week");
    const rows = volumeTreeRows(week, "shoulders", 2);
    expect(rows.map((row) => [row.id, row.sets])).toEqual([
      ["deltoid", 2],
      [OTHER_TARGET, 1],
    ]);
    expect(rows[0]?.children?.map((row) => [row.id, row.sets])).toEqual([
      ["side_delt", 1.5],
      ["front_delt", 1],
    ]);
  });

  it("shows no breakdown for a group trained only at group level", () => {
    const [week] = weeklyVolumeByMuscle([untaggedShoulders], 0);
    if (!week) throw new Error("no week");
    expect(volumeTreeRows(week, "shoulders")).toEqual([]);
  });
});
