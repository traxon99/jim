import {
  type PersonalRecordEntry,
  STRENGTH_STANDARD_TIERS,
  type StandardLift,
  type StrengthProfile,
  type StrengthStandardTier,
  currentPersonalRecords,
  exerciseDisplayName,
  liftStandardThresholds,
  nearestLoadableWeight,
  nextTier,
  standardLiftForSlug,
  tierForOneRepMax,
  weightForTargetReps,
} from "@jim/core";
import type { PortalRecordExercise, PortalRecordsData } from "./records-data";

/** What the Standards section reads: the Records data plus the user's bar and plates. */
export interface PortalStandardsData extends PortalRecordsData {
  barWeight: number;
  plates: number[];
}

/** The lifts standards are published for, in the order the page lists them. */
export const STANDARD_LIFTS: readonly StandardLift[] = [
  "squat",
  "benchPress",
  "deadlift",
  "overheadPress",
];

/** The rep count a next-tier working set is suggested at. */
export const TARGET_REPS = 5;

export interface StandardLiftRow {
  lift: StandardLift;
  /** The logged exercise behind it, when there is one. */
  exerciseId: string | null;
  name: string | null;
  /** Best estimated 1RM ever, or null before the lift has a 1RM PR. */
  oneRepMax: number | null;
  achievedAt: Date | null;
  /** e1RM as a multiple of today's bodyweight. */
  ratio: number | null;
  tier: StrengthStandardTier | null;
  thresholds: Record<StrengthStandardTier, number>;
  /** The tier above, or null at Elite. */
  next: {
    tier: StrengthStandardTier;
    oneRepMax: number;
    /** e1RM still to add; the full threshold before the lift is logged. */
    toGo: number;
    /** A loadable working weight for `TARGET_REPS` that would reach it. */
    workingWeight: number;
  } | null;
}

/**
 * The lightest load the bar and plates can make that is at least `weight`,
 * so a suggested next-tier set actually reaches the tier rather than
 * rounding down just short of it.
 */
export function loadableAtLeast(
  weight: number,
  barWeight: number,
  plates: readonly number[],
): number {
  let load = nearestLoadableWeight(weight, barWeight, plates);
  const smallest = Math.min(...plates.filter((plate) => plate > 0));
  if (!Number.isFinite(smallest)) return load;
  // One more pair of the smallest plate is always loadable, so this ends.
  while (load < weight - 1e-6) load = nearestLoadableWeight(load + 2 * smallest, barWeight, plates);
  return load;
}

/**
 * Where each standard lift stands today (issue #470): its all-time e1RM PR
 * against thresholds at today's bodyweight, and what reaching the next tier
 * takes, as an e1RM and as a loadable 5-rep working set. Lifts never logged
 * still list their thresholds, so the page shows where to start.
 */
export function buildStandardRows({
  entries,
  exercises,
  profile,
  barWeight,
  plates,
}: {
  entries: readonly PersonalRecordEntry[];
  exercises: readonly PortalRecordExercise[];
  /** Today's profile: sex, age and the latest bodyweight. */
  profile: StrengthProfile;
  barWeight: number;
  plates: readonly number[];
}): StandardLiftRow[] {
  const bestByExercise = new Map<string, PersonalRecordEntry>();
  for (const record of currentPersonalRecords(entries)) {
    if (record.kind === "1rm") bestByExercise.set(record.exerciseId, record);
  }

  return STANDARD_LIFTS.map((lift) => {
    // More than one exercise can share a slug only in odd data; take the strongest.
    const best = exercises
      .filter((exercise) => standardLiftForSlug(exercise.slug) === lift)
      .map((exercise) => ({ exercise, record: bestByExercise.get(exercise.id) }))
      .sort((a, b) => (b.record?.value ?? -1) - (a.record?.value ?? -1))[0];
    const record = best?.record ?? null;
    const oneRepMax = record?.value ?? null;
    const thresholds = liftStandardThresholds(lift, profile);
    const tier = oneRepMax == null ? null : tierForOneRepMax(lift, oneRepMax, profile);
    const upcoming = nextTier(tier);
    const target = upcoming ? thresholds[upcoming] : null;

    return {
      lift,
      exerciseId: best?.exercise.id ?? null,
      name: best ? exerciseDisplayName(best.exercise) : null,
      oneRepMax,
      achievedAt: record?.achievedAt ?? null,
      ratio: oneRepMax == null ? null : oneRepMax / profile.bodyweight,
      tier,
      thresholds,
      next:
        upcoming && target != null
          ? {
              tier: upcoming,
              oneRepMax: target,
              toGo: Math.max(0, target - (oneRepMax ?? 0)),
              workingWeight: loadableAtLeast(
                weightForTargetReps(target, TARGET_REPS),
                barWeight,
                plates,
              ),
            }
          : null,
    };
  });
}

/**
 * How far along the tier ladder an e1RM sits, from 0 (nothing) to 1 (Elite),
 * with each tier given an equal share so the bar reads like the tier list.
 */
export function ladderPosition(
  oneRepMax: number | null,
  thresholds: Record<StrengthStandardTier, number>,
): number {
  if (oneRepMax == null || oneRepMax <= 0) return 0;
  const steps = [0, ...STRENGTH_STANDARD_TIERS.map((tier) => thresholds[tier])];
  const share = 1 / (steps.length - 1);
  for (let index = 1; index < steps.length; index++) {
    const low = steps[index - 1] as number;
    const high = steps[index] as number;
    if (oneRepMax < high) {
      return (index - 1 + (oneRepMax - low) / (high - low || 1)) * share;
    }
  }
  return 1;
}
