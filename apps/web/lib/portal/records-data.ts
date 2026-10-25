import type { ExerciseRow } from "@/lib/db/schema";
import type {
  PersonalRecordEntry,
  PredictedOneRepMax,
  StrengthProfile,
  WeightUnit,
} from "@jim/core";
import type { PortalBodyPoint } from "./body-data";

/** An exercise as the Records section searches, filters and badges it. */
export type PortalRecordExercise = Pick<
  ExerciseRow,
  | "id"
  | "slug"
  | "name"
  | "aliases"
  | "ownerId"
  | "isArchived"
  | "primaryMuscles"
  | "secondaryMuscles"
  | "equipment"
  | "category"
  | "trackingType"
> & { machineBrand: string | null; machineModel: string | null };

export type PortalRecordEntry = Omit<PersonalRecordEntry, "achievedAt"> & { achievedAt: string };

/**
 * What the Records section (issue #470) needs to build the phone's PR page
 * in the browser: every live PR row, the exercises they're for, and what
 * the strength standards judge against. The page runs the same
 * `buildPrGroups` the phone does, in the viewer's own time zone.
 */
export interface PortalRecordsData {
  units: WeightUnit;
  entries: PortalRecordEntry[];
  exercises: PortalRecordExercise[];
  strengthProfile: StrengthProfile | null;
  bodyweight: PortalBodyPoint[];
  /** Each lift's predicted 1RM today, by exercise id (issue #713). */
  predictions: Record<string, PredictedOneRepMax>;
}

export function serializeRecordEntries(
  entries: readonly PersonalRecordEntry[],
): PortalRecordEntry[] {
  return entries.map((entry) => ({ ...entry, achievedAt: entry.achievedAt.toISOString() }));
}

export function reviveRecordEntries(entries: readonly PortalRecordEntry[]): PersonalRecordEntry[] {
  return entries.map((entry) => ({ ...entry, achievedAt: new Date(entry.achievedAt) }));
}
