import {
  type AnalysisRange,
  type MuscleVolumeSet,
  type WeeklyMuscleVolume,
  type WeightUnit,
  analysisRangeStart,
  startOfWeek,
  weeklyVolumeByMuscle,
} from "@jim/core";

/** One working set for the Volume section, serializable from the server. */
export interface PortalVolumeSet {
  completedAt: string;
  weight: number | null;
  reps: number | null;
  durationSeconds?: number | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

/** What the desktop Volume section (issue #470) shows. */
export interface PortalVolumeData {
  units: WeightUnit;
  weekStart: number;
  sets: PortalVolumeSet[];
}

export function serializeVolumeSets(sets: readonly MuscleVolumeSet[]): PortalVolumeSet[] {
  return sets.map((set) => ({
    completedAt: set.completedAt.toISOString(),
    weight: set.weight,
    reps: set.reps,
    durationSeconds: set.durationSeconds,
    primaryMuscles: [...set.primaryMuscles],
    secondaryMuscles: [...set.secondaryMuscles],
  }));
}

export function reviveVolumeSets(sets: readonly PortalVolumeSet[]): MuscleVolumeSet[] {
  return sets.map((set) => ({ ...set, completedAt: new Date(set.completedAt) }));
}

/**
 * Every week in the range, newest first, with weeks that had no sets filled
 * in as empty, so a missed week shows as a gap instead of vanishing. Week
 * boundaries are local time, so call this in the browser. Starts no earlier
 * than the first week with a set.
 */
export function volumeWeeksInRange(
  sets: readonly MuscleVolumeSet[],
  weekStart: number,
  range: AnalysisRange,
  now: Date,
): WeeklyMuscleVolume[] {
  const weeks = weeklyVolumeByMuscle(sets, weekStart);
  const byStart = new Map(weeks.map((week) => [week.weekStart.getTime(), week]));
  const rangeStart = analysisRangeStart(range, now);
  const oldest = weeks[weeks.length - 1]?.weekStart;
  if (!oldest) return [];
  // The range's first full week, so "4 weeks" shows 4 weeks, this one
  // included, but never before the first week with a set: weeks before the
  // user started would only drag the averages down.
  const rangeFirst =
    rangeStart == null
      ? oldest
      : startOfWeek(new Date(rangeStart.getTime() + 7 * 24 * 60 * 60 * 1000), weekStart);
  const first = rangeFirst.getTime() > oldest.getTime() ? rangeFirst : oldest;

  const result: WeeklyMuscleVolume[] = [];
  const cursor = startOfWeek(now, weekStart);
  while (cursor.getTime() >= first.getTime()) {
    result.push(
      byStart.get(cursor.getTime()) ?? {
        weekStart: new Date(cursor),
        volumeByMuscle: {},
        setsByMuscle: {},
      },
    );
    // setDate, not minus 7 days of ms, so a DST change keeps local midnight.
    cursor.setDate(cursor.getDate() - 7);
  }
  return result;
}

/** Each muscle's average per week across `weeks`, empty weeks included. */
export function averagePerWeek(
  weeks: readonly WeeklyMuscleVolume[],
  pick: (week: WeeklyMuscleVolume) => Readonly<Record<string, number>>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const week of weeks) {
    for (const [muscle, value] of Object.entries(pick(week))) {
      totals[muscle] = (totals[muscle] ?? 0) + value;
    }
  }
  if (weeks.length === 0) return totals;
  for (const muscle of Object.keys(totals)) {
    totals[muscle] = (totals[muscle] ?? 0) / weeks.length;
  }
  return totals;
}
