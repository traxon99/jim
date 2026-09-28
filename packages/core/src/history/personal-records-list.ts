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

export interface PersonalRecordStats {
  /** Current PRs across every exercise and kind. */
  current: number;
  /** PR rows set since the start of this calendar month. */
  thisMonth: number;
  /** PR rows set in the last `RECENT_PR_DAYS` days. */
  recent: number;
  /** Exercises with at least one PR. */
  exercises: number;
}

/** A PR set this recently is highlighted as "New" on the PR page (issue #237). */
export const RECENT_PR_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isRecentPersonalRecord(record: Pick<PersonalRecordEntry, "achievedAt">, now: Date) {
  return now.getTime() - record.achievedAt.getTime() < RECENT_PR_DAYS * DAY_MS;
}

/** The PR page's headline tiles. Counts every PR row, not just the current bests. */
export function personalRecordStats(
  records: readonly PersonalRecordEntry[],
  now: Date,
): PersonalRecordStats {
  const current = currentPersonalRecords(records);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return {
    current: current.length,
    thisMonth: records.filter((record) => record.achievedAt.getTime() >= monthStart).length,
    recent: records.filter((record) => isRecentPersonalRecord(record, now)).length,
    exercises: new Set(current.map((record) => record.exerciseId)).size,
  };
}

/**
 * The record-by-record climb of one exercise's PR of one kind, oldest
 * first — the PR page's sparkline. Each point is a new best, so the values
 * only ever rise; a row that doesn't beat the running best (a tie, or one
 * synced in out of order) is skipped.
 */
export function personalRecordProgression(
  records: readonly PersonalRecordEntry[],
  exerciseId: string,
  kind: PrKind,
): { value: number; achievedAt: Date }[] {
  const points: { value: number; achievedAt: Date }[] = [];
  const sorted = records
    .filter((record) => record.exerciseId === exerciseId && record.kind === kind)
    .sort((a, b) => a.achievedAt.getTime() - b.achievedAt.getTime());
  for (const record of sorted) {
    const last = points[points.length - 1];
    if (!last || record.value > last.value) {
      points.push({ value: record.value, achievedAt: record.achievedAt });
    }
  }
  return points;
}
