import { tierForOneRepMax } from "../strength-standards/lookup";
import {
  STRENGTH_STANDARD_TIERS,
  type StandardLift,
  type StrengthProfile,
  type StrengthStandardTier,
} from "../strength-standards/types";
import { startOfWeek } from "./week-grouping";

/*
 * Achievements and training streaks (issue #253). Nothing here is stored:
 * every badge is re-derived from history on each read, in the spirit of
 * ADR-016, so deleting a workout (or editing a set) recalculates them with
 * no bookkeeping, and they work offline off IndexedDB like every other view.
 */

// ---------------------------------------------------------------------------
// Weekly streak
// ---------------------------------------------------------------------------

export interface StreakProgram {
  mode: "sequence" | "weekly";
  /** `routineId: null` is a rest day (issue #366), which plans no workout. */
  items: readonly { routineId?: string | null; weekday: number | null; deletedAt: Date | null }[];
}

/**
 * How many workouts a week keeps the streak alive. A weekly program plans
 * one workout per scheduled weekday; a rotating sequence has no calendar,
 * so its cycle length (capped at a week) stands in for it. With no active
 * program, any one workout a week counts — the streak is about showing up,
 * not punishing rest days.
 */
export function weeklyStreakTarget(program: StreakProgram | null): number {
  if (!program) return 1;
  const items = program.items.filter((item) => !item.deletedAt && item.routineId !== null);
  if (program.mode === "weekly") {
    const weekdays = new Set(items.flatMap((item) => (item.weekday == null ? [] : [item.weekday])));
    return Math.max(1, weekdays.size);
  }
  return Math.min(7, Math.max(1, items.length));
}

export interface TrainingStreak {
  /** Workouts a week needs to count toward the streak. */
  weeklyTarget: number;
  /** Consecutive weeks meeting the target, ending this week or last. */
  current: number;
  longest: number;
  /** Workouts so far in the current week. */
  thisWeek: number;
}

function nextWeek(week: Date): Date {
  // By calendar date rather than 7 × 24h, so a DST change can't drift it.
  return new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7);
}

function previousWeek(week: Date): Date {
  return new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7);
}

/**
 * Consecutive weeks (per the user's `weekStart`) with at least
 * `weeklyTarget` workouts. The current week is still in progress, so
 * falling short of it so far doesn't break the streak — it just isn't
 * counted until it's met.
 */
export function trainingStreak(
  workoutDates: readonly Date[],
  weeklyTarget: number,
  weekStart: number,
  now: Date,
): TrainingStreak {
  const target = Math.max(1, weeklyTarget);
  const counts = new Map<number, number>();
  let earliest: Date | null = null;
  for (const date of workoutDates) {
    const key = startOfWeek(date, weekStart).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!earliest || date < earliest) earliest = date;
  }

  const thisWeekStart = startOfWeek(now, weekStart);
  const countFor = (week: Date) => counts.get(week.getTime()) ?? 0;
  const met = (week: Date) => countFor(week) >= target;

  let current = 0;
  let week = met(thisWeekStart) ? thisWeekStart : previousWeek(thisWeekStart);
  while (met(week)) {
    current += 1;
    week = previousWeek(week);
  }

  let longest = 0;
  if (earliest) {
    let run = 0;
    for (
      let cursor = startOfWeek(earliest, weekStart);
      cursor.getTime() <= thisWeekStart.getTime();
      cursor = nextWeek(cursor)
    ) {
      run = met(cursor) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }

  return { weeklyTarget: target, current, longest, thisWeek: countFor(thisWeekStart) };
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export interface AchievementWorkout {
  sessionId: string;
  endedAt: Date;
}

/** One resolved, non-deleted working set from a finished, non-deleted workout. */
export interface AchievementSet {
  sessionId: string;
  completedAt: Date;
  weight: number | null;
  reps: number | null;
  /** Plate and bodyweight milestones only count barbell lifts. */
  barbell: boolean;
}

/** An estimated-1RM PR on one of the lifts with published strength standards. */
export interface AchievementStrengthRecord {
  lift: StandardLift;
  oneRepMax: number;
  achievedAt: Date;
  sessionId: string | null;
}

export interface AchievementInput {
  workouts: readonly AchievementWorkout[];
  sets: readonly AchievementSet[];
  units: "kg" | "lb";
  /** Current bodyweight in `units`; bodyweight milestones are skipped without it. */
  bodyweight: number | null;
  /** Null skips strength-standard milestones (the profile isn't filled in). */
  strengthProfile: StrengthProfile | null;
  /**
   * The bodyweight (in `units`) that applied on a date, from the weigh-in
   * history (issue #247). Badges judge each lift against it; without it, or
   * where it returns null, they fall back to the current bodyweight.
   */
  bodyweightOn?: (date: Date) => number | null;
  strengthRecords: readonly AchievementStrengthRecord[];
}

export type AchievementCategory = "workouts" | "volume" | "plates" | "bodyweight" | "strength";

export interface Achievement {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  /** When it was earned; null while it's still ahead. */
  achievedAt: Date | null;
  /** The workout it was earned in, when there is one. */
  sessionId: string | null;
  /** How close an unearned count-based milestone is. */
  progress: { current: number; target: number } | null;
}

const WORKOUT_MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000] as const;
const VOLUME_MILESTONES = [10_000, 100_000, 500_000, 1_000_000, 5_000_000] as const;
/** Plates per side on a standard bar: 20 kg / 45 lb bar and plates. */
const PLATE_MILESTONES = [1, 2, 3, 4] as const;
const BODYWEIGHT_MULTIPLES = [1, 1.5, 2] as const;

const PLATE_WEIGHT = { kg: 20, lb: 45 } as const;

/** Total bar load for `plates` plates a side — 60 kg / 135 lb for one. */
export function plateLoad(plates: number, units: "kg" | "lb"): number {
  return PLATE_WEIGHT[units] * (1 + 2 * plates);
}

/**
 * Whole plates a side a barbell load represents (0 below one plate), for
 * the PR page's plate medals (issue #237).
 */
export function platesPerSide(load: number, units: "kg" | "lb"): number {
  const plates = Math.floor((load / PLATE_WEIGHT[units] - 1) / 2 + 1e-9);
  return Math.max(0, plates);
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}k`;
  return String(value);
}

const TIER_TITLES: Record<StrengthStandardTier, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  elite: "Elite",
};

function byTime<T>(items: readonly T[], getDate: (item: T) => Date): T[] {
  return [...items].sort((a, b) => getDate(a).getTime() - getDate(b).getTime());
}

/** The first set, oldest first, that passes `test`. */
function firstSet(
  sets: readonly AchievementSet[],
  test: (set: AchievementSet) => boolean,
): AchievementSet | null {
  return sets.find(test) ?? null;
}

function setVolume(set: AchievementSet): number {
  if (set.weight == null || set.reps == null || set.weight <= 0 || set.reps <= 0) return 0;
  return set.weight * set.reps;
}

function liftedAtLeast(load: number) {
  return (set: AchievementSet) =>
    set.barbell && set.weight != null && set.weight >= load && (set.reps ?? 0) > 0;
}

/**
 * Every milestone, earned or not, in a stable display order (category,
 * then difficulty). Returns an empty list for someone with no finished
 * workouts, so a brand-new user isn't shown a wall of locked badges.
 */
export function deriveAchievements(input: AchievementInput): Achievement[] {
  if (input.workouts.length === 0) return [];

  const achievements: Achievement[] = [];
  const workouts = byTime(input.workouts, (workout) => workout.endedAt);
  const sets = byTime(input.sets, (set) => set.completedAt);

  for (const count of WORKOUT_MILESTONES) {
    const workout = workouts[count - 1];
    achievements.push({
      id: `workouts-${count}`,
      category: "workouts",
      title: count === 1 ? "First workout" : `${count} workouts`,
      description:
        count === 1 ? "Finish your first workout" : `Finish ${count.toLocaleString()} workouts`,
      achievedAt: workout?.endedAt ?? null,
      sessionId: workout?.sessionId ?? null,
      progress: workout ? null : { current: workouts.length, target: count },
    });
  }

  let runningVolume = 0;
  const volumeCrossings = new Map<number, AchievementSet>();
  for (const set of sets) {
    runningVolume += setVolume(set);
    for (const milestone of VOLUME_MILESTONES) {
      if (runningVolume >= milestone && !volumeCrossings.has(milestone)) {
        volumeCrossings.set(milestone, set);
      }
    }
  }
  for (const milestone of VOLUME_MILESTONES) {
    const set = volumeCrossings.get(milestone);
    achievements.push({
      id: `volume-${milestone}`,
      category: "volume",
      title: `${compactNumber(milestone)} ${input.units} lifted`,
      description: `Lift ${milestone.toLocaleString()} ${input.units} in total`,
      achievedAt: set?.completedAt ?? null,
      sessionId: set?.sessionId ?? null,
      progress: set ? null : { current: Math.round(runningVolume), target: milestone },
    });
  }

  for (const plates of PLATE_MILESTONES) {
    const load = plateLoad(plates, input.units);
    const set = firstSet(sets, liftedAtLeast(load));
    achievements.push({
      id: `plates-${plates}`,
      category: "plates",
      title: plates === 1 ? "One plate" : `${plates} plates`,
      description: `Lift ${load} ${input.units} on a barbell`,
      achievedAt: set?.completedAt ?? null,
      sessionId: set?.sessionId ?? null,
      progress: null,
    });
  }

  const bodyweightOn = (date: Date, fallback: number): number => {
    const dated = input.bodyweightOn?.(date);
    return dated != null && Number.isFinite(dated) && dated > 0 ? dated : fallback;
  };

  if (input.bodyweight != null && input.bodyweight > 0) {
    const current = input.bodyweight;
    for (const multiple of BODYWEIGHT_MULTIPLES) {
      const set = firstSet(sets, (candidate) =>
        liftedAtLeast(bodyweightOn(candidate.completedAt, current) * multiple)(candidate),
      );
      achievements.push({
        id: `bodyweight-${multiple}`,
        category: "bodyweight",
        title: multiple === 1 ? "Bodyweight lift" : `${multiple}× bodyweight`,
        description:
          multiple === 1
            ? "Lift your bodyweight on a barbell"
            : `Lift ${multiple}× your bodyweight on a barbell`,
        achievedAt: set?.completedAt ?? null,
        sessionId: set?.sessionId ?? null,
        progress: null,
      });
    }
  }

  if (input.strengthProfile) {
    const profile = input.strengthProfile;
    const records = byTime(input.strengthRecords, (record) => record.achievedAt).map((record) => {
      const tier = tierForOneRepMax(record.lift, record.oneRepMax, {
        ...profile,
        bodyweight: bodyweightOn(record.achievedAt, profile.bodyweight),
      });
      return { record, tierIndex: tier ? STRENGTH_STANDARD_TIERS.indexOf(tier) : -1 };
    });
    STRENGTH_STANDARD_TIERS.forEach((tier, index) => {
      const hit = records.find((entry) => entry.tierIndex >= index)?.record ?? null;
      achievements.push({
        id: `strength-${tier}`,
        category: "strength",
        title: `${TIER_TITLES[tier]} lifter`,
        description: `Reach the ${TIER_TITLES[tier].toLowerCase()} strength standard on a main lift`,
        achievedAt: hit?.achievedAt ?? null,
        sessionId: hit?.sessionId ?? null,
        progress: null,
      });
    });
  }

  return achievements;
}

/** Achievements earned in one workout — what the session summary celebrates. */
export function achievementsEarnedInSession(
  achievements: readonly Achievement[],
  sessionId: string,
): Achievement[] {
  return achievements.filter(
    (achievement) => achievement.achievedAt && achievement.sessionId === sessionId,
  );
}
