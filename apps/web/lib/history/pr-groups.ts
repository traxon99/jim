import type {
  ExerciseRow,
  PersonalRecordRow,
  SessionExerciseRow,
  SessionRow,
  SetRow,
} from "@/lib/db/schema";
import { strengthProfileOn } from "@/lib/strength-standards/profile";
import {
  type PersonalRecordEntry,
  type PersonalRecordSortKey,
  type PrKind,
  type StrengthProfile,
  type StrengthStandardTier,
  type WeightUnit,
  currentPersonalRecords,
  exerciseDisplayName,
  filterExercises,
  isRecentPersonalRecord,
  liftStandardThresholds,
  personalRecordProgression,
  platesPerSide,
  searchExercises,
  sortPersonalRecordGroups,
  standardLiftForSlug,
  tierForOneRepMax,
  tracksRepsAtWeight,
} from "@jim/core";
import { toPersonalRecordEntries } from "./pr-data";

/** Which PR a collapsed card leads with, in order of preference. */
const HEADLINE_KINDS: readonly PrKind[] = ["1rm", "weight", "volume", "reps_at_weight"];

type PrExercise = Pick<ExerciseRow, "id" | "name" | "slug" | "equipment" | "trackingType"> &
  Partial<Pick<ExerciseRow, "machineBrand" | "machineModel">>;

/**
 * Every live PR row the PR page counts and traces (issue #200 drops PRs from
 * deleted workouts). "Most reps at a weight" rows logged for loaded
 * exercises before issue #354 stopped recording them are left out too.
 */
export function buildPersonalRecordEntries(
  records: readonly PersonalRecordRow[],
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  sets: readonly SetRow[],
  exercises: readonly Pick<ExerciseRow, "id" | "trackingType">[],
): PersonalRecordEntry[] {
  const repsAtWeightIds = new Set(
    exercises.filter((e) => tracksRepsAtWeight(e.trackingType)).map((e) => e.id),
  );
  return toPersonalRecordEntries(records, sessions, sessionExercises, sets).filter(
    (entry) => entry.kind !== "reps_at_weight" || repsAtWeightIds.has(entry.exerciseId),
  );
}

export interface PrGroup {
  exerciseId: string;
  name: string;
  /** The exercise's current best of each kind, by kind. */
  records: PersonalRecordEntry[];
  headlineRecord: PersonalRecordEntry;
  /** e1RM, else heaviest weight: what "Heaviest" sorts by. */
  headline: number | null;
  latestAt: Date;
  /** Where the e1RM sits against the published standards, when the lift has one. */
  standard: {
    tier: StrengthStandardTier | null;
    thresholds: Record<StrengthStandardTier, number>;
  } | null;
  /** Plates a side on the heaviest barbell lift (issue #237). */
  plates: number;
  /** Each new best over time, for the sparkline. */
  progression: { value: number; achievedAt: Date }[];
  hasRecent: boolean;
}

/**
 * The PR page's cards (STORIES.md S7, issues #236/#237): one per exercise
 * with its current bests, a strength-standard tier judged at the bodyweight
 * that applied when the e1RM was set (issue #249), its plate medal and its
 * PR climb. Alphabetical; `filterPrGroups` sorts and narrows.
 */
export function buildPrGroups({
  entries,
  exercises,
  strengthProfile,
  bodyweightAt,
  units,
  now,
}: {
  entries: readonly PersonalRecordEntry[];
  exercises: readonly PrExercise[];
  strengthProfile: StrengthProfile | null;
  bodyweightAt: (date: Date) => number | null;
  units: WeightUnit;
  now: Date;
}): PrGroup[] {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const groups = new Map<string, PersonalRecordEntry[]>();
  for (const record of currentPersonalRecords(entries)) {
    const list = groups.get(record.exerciseId);
    if (list) {
      list.push(record);
    } else {
      groups.set(record.exerciseId, [record]);
    }
  }

  return [...groups.entries()]
    .map(([exerciseId, records]) => {
      const exercise = exerciseById.get(exerciseId);
      const standardLift = standardLiftForSlug(exercise?.slug);
      const oneRepMaxRecord = records.find((r) => r.kind === "1rm");
      const oneRepMax = oneRepMaxRecord?.value ?? null;
      const profileThen =
        strengthProfile && oneRepMaxRecord
          ? strengthProfileOn(strengthProfile, bodyweightAt, oneRepMaxRecord.achievedAt)
          : null;

      const standard =
        standardLift && profileThen && oneRepMax
          ? {
              tier: tierForOneRepMax(standardLift, oneRepMax, profileThen),
              thresholds: liftStandardThresholds(standardLift, profileThen),
            }
          : null;

      const heaviest = records.find((r) => r.kind === "weight")?.value ?? null;
      const plates =
        exercise?.equipment === "barbell" && heaviest != null ? platesPerSide(heaviest, units) : 0;

      // The 1RM climb reads best; fall back to heaviest weight for lifts
      // that only have one.
      const oneRepMaxProgression = personalRecordProgression(entries, exerciseId, "1rm");
      const progression =
        oneRepMaxProgression.length >= 2
          ? oneRepMaxProgression
          : personalRecordProgression(entries, exerciseId, "weight");

      const headlineRecord = (HEADLINE_KINDS.map((kind) =>
        records.find((r) => r.kind === kind),
      ).find(Boolean) ?? records[0]) as PersonalRecordEntry;

      return {
        exerciseId,
        name: exercise ? exerciseDisplayName(exercise) : "Unknown exercise",
        records: records.sort((a, b) => a.kind.localeCompare(b.kind)),
        headlineRecord,
        headline: oneRepMax ?? heaviest,
        latestAt: new Date(Math.max(...records.map((r) => r.achievedAt.getTime()))),
        standard,
        plates,
        progression,
        hasRecent: records.some((r) => isRecentPersonalRecord(r, now)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

type FilterableExercise = Parameters<typeof filterExercises>[0][number];

/**
 * Muscle and equipment choices from only the exercises that have PRs, so no
 * filter option can empty the page on its own.
 */
export function prFilterOptions(exercises: readonly FilterableExercise[]): {
  muscleOptions: string[];
  equipmentOptions: string[];
} {
  const muscles = new Set<string>();
  const equipmentSet = new Set<string>();
  for (const exercise of exercises) {
    for (const m of exercise.primaryMuscles) muscles.add(m);
    for (const m of exercise.secondaryMuscles) muscles.add(m);
    if (exercise.equipment) equipmentSet.add(exercise.equipment);
  }
  return { muscleOptions: [...muscles].sort(), equipmentOptions: [...equipmentSet].sort() };
}

/**
 * The cards to show for a search, filters and sort. A search ranks by
 * relevance, like the exercise list; filters alone keep the chosen sort.
 */
export function filterPrGroups<
  T extends Pick<PrGroup, "exerciseId" | "name" | "latestAt" | "headline">,
>(
  groups: readonly T[],
  prExercises: readonly FilterableExercise[],
  {
    query,
    muscle,
    equipment,
    sortKey,
  }: { query: string; muscle: string; equipment: string; sortKey: PersonalRecordSortKey },
): T[] {
  const sorted = sortPersonalRecordGroups(groups, sortKey);
  if (query.trim() === "" && !muscle && !equipment) return sorted;
  const filtered = filterExercises(prExercises, {
    muscle: muscle || undefined,
    equipment: equipment || undefined,
    includeArchived: true,
  });
  const ranked = query.trim() ? searchExercises(filtered, query) : filtered;
  const rank = new Map(ranked.map((exercise, index) => [exercise.id, index]));
  const matches = sorted.filter((group) => rank.has(group.exerciseId));
  return query.trim()
    ? matches.sort((a, b) => (rank.get(a.exerciseId) ?? 0) - (rank.get(b.exerciseId) ?? 0))
    : matches;
}
