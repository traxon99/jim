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
const RECENT_PR_DAYS = 7;

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

/** The window for the PR page's "Recent PRs" section (issue #236). */
export const RECENT_PR_SECTION_DAYS = 30;

/**
 * PR rows set in the last `days` days, newest first — the PR page's
 * "Recent PRs" section. Only rows that are still the current best for
 * their exercise and kind count, so a PR beaten again the same week shows
 * once, at its latest value.
 */
export function recentPersonalRecords(
  records: readonly PersonalRecordEntry[],
  now: Date,
  days: number = RECENT_PR_SECTION_DAYS,
): PersonalRecordEntry[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return currentPersonalRecords(records)
    .filter((record) => record.achievedAt.getTime() >= cutoff)
    .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
}

export type PersonalRecordSortKey = "recent" | "heaviest" | "name";

export interface PersonalRecordGroupSortable {
  name: string;
  /** When this exercise's newest current PR was set. */
  latestAt: Date;
  /** The headline number: estimated 1RM, else heaviest weight; null for rep-only lifts. */
  headline: number | null;
}

/**
 * Orders the PR page's per-exercise cards (issue #236). "heaviest" puts
 * lifts without a weight-based headline last; every key falls back to
 * name so the order is stable.
 */
export function sortPersonalRecordGroups<T extends PersonalRecordGroupSortable>(
  groups: readonly T[],
  key: PersonalRecordSortKey,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return [...groups].sort((a, b) => {
    if (key === "recent") {
      return b.latestAt.getTime() - a.latestAt.getTime() || byName(a, b);
    }
    if (key === "heaviest") {
      if (a.headline == null && b.headline == null) return byName(a, b);
      if (a.headline == null) return 1;
      if (b.headline == null) return -1;
      return b.headline - a.headline || byName(a, b);
    }
    return byName(a, b);
  });
}
