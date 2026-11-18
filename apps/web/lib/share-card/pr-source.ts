import type { PersonalRecordRow, SessionExerciseRow, SetRow } from "@/lib/db/schema";

export interface RecordSetDetails {
  weight: number | null;
  reps: number | null;
  /** The workout the record was set in, for its routine color. */
  sessionId: string | null;
}

const NONE: RecordSetDetails = { weight: null, reps: null, sessionId: null };

/**
 * The set behind a personal record (its weight × reps and workout), so a PR
 * card can show more than the record's value. Empty when the row or its set
 * isn't local.
 */
export function recordSetDetails(
  recordId: string,
  records: readonly PersonalRecordRow[],
  sets: readonly SetRow[],
  sessionExercises: readonly SessionExerciseRow[],
): RecordSetDetails {
  const setId = records.find((record) => record.id === recordId)?.setId;
  const set = setId ? sets.find((candidate) => candidate.id === setId) : undefined;
  if (!set) return NONE;
  const sessionId =
    sessionExercises.find((sessionExercise) => sessionExercise.id === set.sessionExerciseId)
      ?.sessionId ?? null;
  return {
    weight: set.weight == null ? null : Number(set.weight),
    reps: set.reps,
    sessionId,
  };
}
