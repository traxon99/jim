import { dayKey, isDayKey } from "../injuries/days";

/**
 * Sick days (issue #779, CONTEXT.md): local calendar days, YYYY-MM-DD, the
 * user marked as sick. They're private and never change a workout; they
 * excuse the day from the weekly streak and push a PRP block's end back.
 */

export const SICK_DAY_NOTE_MAX = 200;
/** The most days one mark (an MCP range) may cover. */
export const SICK_DAY_RANGE_MAX = 31;

/** The subset of a synced sick-day row these helpers read; Dexie and Drizzle rows both fit. */
export interface SickDaySource {
  day: string;
  deletedAt: Date | null;
}

/** The distinct sick days among live rows, oldest first. */
export function sickDayKeys(rows: readonly SickDaySource[]): string[] {
  const days = new Set<string>();
  for (const row of rows) {
    if (!row.deletedAt && isDayKey(row.day)) days.add(row.day);
  }
  return [...days].sort();
}

/** Every day from `from` to `to`, both included, as YYYY-MM-DD. Empty when `to` is before `from`. */
export function dayKeysBetween(from: string, to: string): string[] {
  if (!isDayKey(from) || !isDayKey(to) || to < from) return [];
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  for (let key = from; key <= to; ) {
    days.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    key = cursor.toISOString().slice(0, 10);
  }
  return days;
}

/** The local-noon Date for a day key, so range checks don't slip a day at midnight. */
export function dayKeyNoon(day: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date, 12);
}

/**
 * An instant inside `day` in an IANA zone (the server's view of a user's
 * day, issue #511): noon UTC, nudged 12 hours when the zone is far enough
 * east or west that noon UTC falls on the day before or after.
 */
export function dayKeyInstant(day: string, timeZone: string): Date {
  const noon = new Date(`${day}T12:00:00Z`);
  const local = dayKey(noon, timeZone);
  if (local > day) return new Date(noon.getTime() - 12 * 60 * 60 * 1000);
  if (local < day) return new Date(noon.getTime() + 12 * 60 * 60 * 1000);
  return noon;
}
