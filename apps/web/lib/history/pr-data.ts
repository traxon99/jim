import type { PersonalRecordRow, SessionExerciseRow, SessionRow, SetRow } from "@/lib/db/schema";
import {
  type PersonalRecordEntry,
  deletedSessionExerciseIds,
  withoutDeletedSessionRecords,
} from "@jim/core";

/**
 * Adapts Dexie's raw `personal_records` rows (numeric columns as strings) to
 * `currentPersonalRecords`'s input shape, leaving out PRs set in a deleted
 * workout (issue #200) — pass raw `sets`, not resolved ones, so PRs on a
 * since-edited set still find their session.
 */
export function toPersonalRecordEntries(
  records: readonly PersonalRecordRow[],
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  sets: readonly SetRow[],
): PersonalRecordEntry[] {
  const deleted = deletedSessionExerciseIds(sessions, sessionExercises);
  return withoutDeletedSessionRecords(
    records.filter((record) => !record.deletedAt),
    sets,
    deleted,
  ).map((record) => ({
    id: record.id,
    exerciseId: record.exerciseId,
    kind: record.kind,
    value: Number(record.value),
    achievedAt: record.achievedAt,
  }));
}
