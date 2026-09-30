import { type WeekGroup, groupByWeek } from "./week-grouping";

/** A set's full volume counts toward every primary muscle it targets. */
export const PRIMARY_MUSCLE_VOLUME_WEIGHT = 1;
/**
 * A secondary muscle is assistance work rather than the target of the set,
 * so it counts at half weight. This is the "documented, consistent
 * weighting" STORIES.md S7 asks for — simple, and it tells targeted work
 * apart from incidental work without needing per-exercise tuning.
 */
export const SECONDARY_MUSCLE_VOLUME_WEIGHT = 0.5;

export interface MuscleVolumeSet {
  completedAt: Date;
  weight: number | null;
  reps: number | null;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
}

export interface WeeklyMuscleVolume {
  weekStart: Date;
  volumeByMuscle: Readonly<Record<string, number>>;
  /**
   * Hard sets per muscle (issue #332), the measure lifters and RP-style
   * apps track, weighted like volume: a secondary muscle counts half a set.
   * Unlike volume, a set counts with reps but no weight (bodyweight work).
   */
  setsByMuscle: Readonly<Record<string, number>>;
}

/**
 * "Weekly volume by muscle group" (STORIES.md S7). Callers join each set
 * to its exercise's `primaryMuscles`/`secondaryMuscles` and pass only
 * resolved, non-deleted, weight+reps sets.
 */
export function weeklyVolumeByMuscle(
  sets: readonly MuscleVolumeSet[],
  weekStart: number,
): WeeklyMuscleVolume[] {
  const groups: WeekGroup<MuscleVolumeSet>[] = groupByWeek(
    sets,
    weekStart,
    (set) => set.completedAt,
  );

  return groups.map((group) => {
    const volumeByMuscle: Record<string, number> = {};
    const setsByMuscle: Record<string, number> = {};

    for (const set of group.items) {
      if (set.reps == null || set.reps <= 0) continue;
      for (const muscle of set.primaryMuscles) {
        setsByMuscle[muscle] = (setsByMuscle[muscle] ?? 0) + PRIMARY_MUSCLE_VOLUME_WEIGHT;
      }
      for (const muscle of set.secondaryMuscles) {
        setsByMuscle[muscle] = (setsByMuscle[muscle] ?? 0) + SECONDARY_MUSCLE_VOLUME_WEIGHT;
      }

      if (set.weight == null || set.weight <= 0) continue;
      const volume = set.weight * set.reps;

      for (const muscle of set.primaryMuscles) {
        volumeByMuscle[muscle] =
          (volumeByMuscle[muscle] ?? 0) + volume * PRIMARY_MUSCLE_VOLUME_WEIGHT;
      }
      for (const muscle of set.secondaryMuscles) {
        volumeByMuscle[muscle] =
          (volumeByMuscle[muscle] ?? 0) + volume * SECONDARY_MUSCLE_VOLUME_WEIGHT;
      }
    }

    return { weekStart: group.weekStart, volumeByMuscle, setsByMuscle };
  });
}
