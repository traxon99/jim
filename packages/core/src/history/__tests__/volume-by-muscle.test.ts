import { describe, expect, it } from "vitest";
import {
  type MuscleVolumeSet,
  PRIMARY_MUSCLE_VOLUME_WEIGHT,
  SECONDARY_MUSCLE_VOLUME_WEIGHT,
  weeklyVolumeByMuscle,
} from "../volume-by-muscle";

function set(overrides: Partial<MuscleVolumeSet> = {}): MuscleVolumeSet {
  return {
    completedAt: new Date(2026, 0, 4),
    weight: 225,
    reps: 5,
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps"],
    ...overrides,
  };
}

describe("weeklyVolumeByMuscle", () => {
  it("attributes full volume to primary muscles and half to secondary", () => {
    const [week] = weeklyVolumeByMuscle([set()], 0);
    const volume = 225 * 5;
    expect(week?.volumeByMuscle.chest).toBe(volume * PRIMARY_MUSCLE_VOLUME_WEIGHT);
    expect(week?.volumeByMuscle.triceps).toBe(volume * SECONDARY_MUSCLE_VOLUME_WEIGHT);
  });

  it("sums volume across multiple sets for the same muscle", () => {
    const [week] = weeklyVolumeByMuscle(
      [set({ weight: 225, reps: 5 }), set({ weight: 135, reps: 8 })],
      0,
    );
    expect(week?.volumeByMuscle.chest).toBe(225 * 5 + 135 * 8);
  });

  it("splits sets across different weeks", () => {
    const weeks = weeklyVolumeByMuscle(
      [set({ completedAt: new Date(2026, 0, 4) }), set({ completedAt: new Date(2026, 0, 11) })],
      0,
    );
    expect(weeks).toHaveLength(2);
  });

  it("ignores sets without both weight and reps", () => {
    const [week] = weeklyVolumeByMuscle([set({ weight: null })], 0);
    expect(week?.volumeByMuscle).toEqual({});
  });

  it("returns an empty array for no sets", () => {
    expect(weeklyVolumeByMuscle([], 0)).toEqual([]);
  });
});
