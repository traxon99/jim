/**
 * Pain levels (issue #627, CONTEXT.md "Pain level"): 0 (none) to 10, one per
 * injury per day. A day with no check-in has no pain level; the last value
 * never carries forward.
 */

export const PAIN_MIN = 0;
export const PAIN_MAX = 10;
export const PAIN_LEVELS: readonly number[] = Array.from(
  { length: PAIN_MAX - PAIN_MIN + 1 },
  (_, i) => PAIN_MIN + i,
);

const PAIN_LABELS = [
  "No pain",
  "Barely there",
  "Minor",
  "Noticeable",
  "Distracting",
  "Moderate",
  "Strong",
  "Severe",
  "Intense",
  "Very severe",
  "Worst possible",
] as const;

export function painLabel(level: number): string {
  return PAIN_LABELS[Math.min(PAIN_MAX, Math.max(PAIN_MIN, Math.round(level)))] ?? "";
}

export function isPainLevel(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= PAIN_MIN && value <= PAIN_MAX
  );
}

/** What Jim suggests for an affected exercise at a pain level; the workout itself never changes. */
export type InjurySuggestion = "light" | "swap" | "skip";

export function painSuggestion(level: number | null | undefined): InjurySuggestion | null {
  if (level == null || level <= 0) return null;
  if (level <= 3) return "light";
  if (level <= 6) return "swap";
  return "skip";
}

export const INJURY_SUGGESTION_LABELS: Readonly<Record<InjurySuggestion, string>> = {
  light: "Go light on this one today",
  swap: "Swap this for something that spares it",
  skip: "Skip this one today",
};

/** The fields of a check-in row the pain helpers read; Dexie and Drizzle rows both fit. */
export interface PainCheckinLike {
  injuryId: string;
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  painLevel: number;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * One injury's pain by day, oldest first. Two devices can each write a
 * check-in for the same day; the newest one wins.
 */
export function latestPainByDay(
  checkins: readonly PainCheckinLike[],
  injuryId: string,
): Map<string, number> {
  const newest = new Map<string, PainCheckinLike>();
  for (const row of checkins) {
    if (row.injuryId !== injuryId || row.deletedAt) continue;
    const current = newest.get(row.day);
    if (!current || row.updatedAt > current.updatedAt) newest.set(row.day, row);
  }
  return new Map(
    [...newest.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, row]) => [day, row.painLevel]),
  );
}

/** The pain level logged for `today`, or null without a check-in that day. */
export function todaysPain(
  checkins: readonly PainCheckinLike[],
  injuryId: string,
  today: string,
): number | null {
  return latestPainByDay(checkins, injuryId).get(today) ?? null;
}

/** Zero check-ins in a row before Jim asks "Healed?". */
export const HEALED_PROMPT_STREAK = 3;

/**
 * Whether the latest check-ins are all 0, enough to ask "Healed?". Days
 * without a check-in are skipped, not counted as zeros. Jim only asks:
 * the user marks an injury healed.
 */
export function shouldAskHealed(checkins: readonly PainCheckinLike[], injuryId: string): boolean {
  const levels = [...latestPainByDay(checkins, injuryId).values()];
  if (levels.length < HEALED_PROMPT_STREAK) return false;
  return levels.slice(-HEALED_PROMPT_STREAK).every((level) => level === 0);
}

export interface PainDay {
  /** The worst pain logged that day across injuries. */
  pain: number;
  /** Each injury checked in that day with its level, e.g. "Left knee 4". */
  entries: { injuryId: string; painLevel: number }[];
}

/**
 * Pain by calendar day across every live injury, for the Analysis
 * calendar's "Show injuries" overlay (issue #627). Only days with a
 * check-in appear; nothing carries forward.
 */
export function painCalendar(
  injuryIds: readonly string[],
  checkins: readonly PainCheckinLike[],
): Map<string, PainDay> {
  const days = new Map<string, PainDay>();
  for (const injuryId of injuryIds) {
    for (const [day, painLevel] of latestPainByDay(checkins, injuryId)) {
      const entry = days.get(day) ?? { pain: 0, entries: [] };
      entry.pain = Math.max(entry.pain, painLevel);
      entry.entries.push({ injuryId, painLevel });
      days.set(day, entry);
    }
  }
  return days;
}
