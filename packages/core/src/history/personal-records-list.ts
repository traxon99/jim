import type { PrKind } from "../sessions/personal-records";

export interface PersonalRecordEntry {
  id: string;
  exerciseId: string;
  kind: PrKind;
  value: number;
  achievedAt: Date;
}

/**
 * "PR list across all movements" (STORIES.md S7). A set that beats an
 * exercise's prior best writes a *new* `personal_records` row rather than
 * superseding the old one (see set-actions.ts's `detectAndRecordPrs`), so
 * per (exerciseId, kind) many rows can exist, monotonically increasing in
 * value. The current PR is just the highest-value one; a value tie (only
 * possible for `reps_at_weight`, since two different sets can tie a rep
 * count) breaks on the later `achievedAt`.
 */
export function currentPersonalRecords(
  records: readonly PersonalRecordEntry[],
): PersonalRecordEntry[] {
  const best = new Map<string, PersonalRecordEntry>();

  for (const record of records) {
    const key = `${record.exerciseId}:${record.kind}`;
    const existing = best.get(key);
    if (
      !existing ||
      record.value > existing.value ||
      (record.value === existing.value &&
        record.achievedAt.getTime() > existing.achievedAt.getTime())
    ) {
      best.set(key, record);
    }
  }

  return [...best.values()];
}
