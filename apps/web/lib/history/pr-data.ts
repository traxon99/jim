import type { PersonalRecordRow } from "@/lib/db/schema";
import type { PersonalRecordEntry } from "@jim/core";

/** Adapts Dexie's raw `personal_records` rows (numeric columns as strings) to `currentPersonalRecords`'s input shape. */
export function toPersonalRecordEntries(
  records: readonly PersonalRecordRow[],
): PersonalRecordEntry[] {
  return records
    .filter((record) => !record.deletedAt)
    .map((record) => ({
      id: record.id,
      exerciseId: record.exerciseId,
      kind: record.kind,
      value: Number(record.value),
      achievedAt: record.achievedAt,
    }));
}
