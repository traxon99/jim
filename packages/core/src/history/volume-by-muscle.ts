import { muscleTargetChildren, targetWeights } from "../exercises/muscle-tree";
import { MUSCLES } from "../exercises/muscles";
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
  /** Seconds held, for timed exercises like a plank (issue #513). */
  durationSeconds?: number | null;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  /** Muscle tree tags (#874), when the exercise has them. */
  primaryTargets?: readonly string[];
  secondaryTargets?: readonly string[];
}

export interface WeeklyMuscleVolume {
  weekStart: Date;
  volumeByMuscle: Readonly<Record<string, number>>;
  /**
   * Hard sets per muscle (issue #332), the measure lifters and RP-style
   * apps track, weighted like volume: a secondary muscle counts half a set.
   * Unlike volume, a set counts with reps but no weight (bodyweight work), and
   * a timed hold counts with seconds but no reps (issue #513).
   */
  setsByMuscle: Readonly<Record<string, number>>;
  /**
   * Sets and volume per muscle and head of the muscle tree (#874), weighted
   * the same way. Each node counts a set once, at the highest weight tagged
   * under it, so a muscle never counts more than its group.
   */
  setsByTarget: Readonly<Record<string, number>>;
  volumeByTarget: Readonly<Record<string, number>>;
  /**
   * Per group or muscle with children: the part of its count that reached
   * none of its children, from exercises tagged no deeper. Shown as an
   * "Other" row, so untagged work shows up instead of quietly shrinking a head.
   */
  otherSetsByTarget: Readonly<Record<string, number>>;
  otherVolumeByTarget: Readonly<Record<string, number>>;
}

const GROUP_IDS: ReadonlySet<string> = new Set(MUSCLES);

const HAS_CHILDREN = new Map<string, readonly string[]>();
function childIds(id: string): readonly string[] {
  let ids = HAS_CHILDREN.get(id);
  if (!ids) {
    ids = muscleTargetChildren(id).map((node) => node.id);
    HAS_CHILDREN.set(id, ids);
  }
  return ids;
}

/**
 * The weight a set counts toward each tree node below its groups, and the
 * "other" remainder of each node that has children none of which it reached.
 * An exercise without node tags reaches its groups only.
 */
function treeWeights(set: MuscleVolumeSet): {
  nodes: Map<string, number>;
  other: Map<string, number>;
} {
  const hasTargets = (set.primaryTargets?.length ?? 0) + (set.secondaryTargets?.length ?? 0) > 0;
  const weights = targetWeights(
    hasTargets
      ? { primaryTargets: set.primaryTargets ?? [], secondaryTargets: set.secondaryTargets ?? [] }
      : { primaryTargets: set.primaryMuscles, secondaryTargets: set.secondaryMuscles },
    PRIMARY_MUSCLE_VOLUME_WEIGHT,
    SECONDARY_MUSCLE_VOLUME_WEIGHT,
  );
  const other = new Map<string, number>();
  for (const [id, weight] of weights) {
    const children = childIds(id);
    if (children.length > 0 && !children.some((child) => weights.has(child))) {
      other.set(id, weight);
    }
  }
  return { nodes: weights, other };
}

/**
 * "Weekly volume by muscle group" (STORIES.md S7). Callers join each set
 * to its exercise's `primaryMuscles`/`secondaryMuscles` and pass only
 * resolved, non-deleted, weight+reps sets.
 */
export function weeklyVolumeByMuscle(
  sets: readonly MuscleVolumeSet[],
  weekStart: number,
  timeZone?: string,
): WeeklyMuscleVolume[] {
  const groups: WeekGroup<MuscleVolumeSet>[] = groupByWeek(
    sets,
    weekStart,
    (set) => set.completedAt,
    timeZone,
  );

  return groups.map((group) => {
    const volumeByMuscle: Record<string, number> = {};
    const setsByMuscle: Record<string, number> = {};
    const setsByTarget: Record<string, number> = {};
    const volumeByTarget: Record<string, number> = {};
    const otherSetsByTarget: Record<string, number> = {};
    const otherVolumeByTarget: Record<string, number> = {};
    const addTo = (into: Record<string, number>, from: Map<string, number>, by: number) => {
      for (const [id, weight] of from) into[id] = (into[id] ?? 0) + weight * by;
    };

    for (const set of group.items) {
      const hasReps = set.reps != null && set.reps > 0;
      const hasDuration = set.durationSeconds != null && set.durationSeconds > 0;
      if (!hasReps && !hasDuration) continue;
      for (const muscle of set.primaryMuscles) {
        setsByMuscle[muscle] = (setsByMuscle[muscle] ?? 0) + PRIMARY_MUSCLE_VOLUME_WEIGHT;
      }
      for (const muscle of set.secondaryMuscles) {
        setsByMuscle[muscle] = (setsByMuscle[muscle] ?? 0) + SECONDARY_MUSCLE_VOLUME_WEIGHT;
      }
      const tree = treeWeights(set);
      // Groups live in setsByMuscle, as they always have; the tree maps hold
      // only what sits below them.
      const below = new Map([...tree.nodes].filter(([id]) => !GROUP_IDS.has(id)));
      addTo(setsByTarget, below, 1);
      addTo(otherSetsByTarget, tree.other, 1);

      if (!hasReps || set.reps == null || set.weight == null || set.weight <= 0) continue;
      const volume = set.weight * set.reps;
      addTo(volumeByTarget, below, volume);
      addTo(otherVolumeByTarget, tree.other, volume);

      for (const muscle of set.primaryMuscles) {
        volumeByMuscle[muscle] =
          (volumeByMuscle[muscle] ?? 0) + volume * PRIMARY_MUSCLE_VOLUME_WEIGHT;
      }
      for (const muscle of set.secondaryMuscles) {
        volumeByMuscle[muscle] =
          (volumeByMuscle[muscle] ?? 0) + volume * SECONDARY_MUSCLE_VOLUME_WEIGHT;
      }
    }

    return {
      weekStart: group.weekStart,
      volumeByMuscle,
      setsByMuscle,
      setsByTarget,
      volumeByTarget,
      otherSetsByTarget,
      otherVolumeByTarget,
    };
  });
}
