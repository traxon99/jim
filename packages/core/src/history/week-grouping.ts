/**
 * Users configure `week_start` (0 = Sunday .. 6 = Saturday,
 * docs/ARCHITECTURE.md §4) rather than the app assuming Monday- or
 * Sunday-first weeks. Every weekly grouping in history (the session list,
 * volume-by-muscle) needs to agree on the same week boundary, so it lives
 * here once rather than being reimplemented per view. Without a `timeZone`
 * weeks follow the runtime's own zone (the phone); the server passes the
 * user's (issue #511).
 */
export function startOfWeek(date: Date, weekStart: number, timeZone?: string): Date {
  if (timeZone) return zonedStartOfWeek(date, weekStart, timeZone);
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceWeekStart = (local.getDay() - weekStart + 7) % 7;
  local.setDate(local.getDate() - daysSinceWeekStart);
  return local;
}

/**
 * The start of the week `weeks` after (or, negative, before) the week
 * starting at `start`, in the same week scheme. Not 7 × 24 h: a week that
 * crosses a daylight-saving change is an hour longer or shorter.
 */
export function addWeeks(start: Date, weeks: number, weekStart: number, timeZone?: string): Date {
  // Mid-week, so a DST hour either way still lands in the right week.
  return startOfWeek(new Date(start.getTime() + (weeks * 7 + 3.5) * DAY_MS), weekStart, timeZone);
}

/** Whether `timeZone` is an IANA zone this runtime knows, e.g. "America/Los_Angeles". */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface ZonedDate {
  year: number;
  month: number;
  day: number;
  weekday: number;
  /** Milliseconds the zone is ahead of UTC at this instant. */
  offset: number;
}

/** The wall-clock date in `timeZone` at the instant `date` (issue #511). */
function zonedDate(date: Date, timeZone: string): ZonedDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const wallClock = Date.UTC(
    year,
    month - 1,
    day,
    Number(part("hour")),
    Number(part("minute")),
    Number(part("second")),
  );
  const offset = wallClock - Math.floor(date.getTime() / 1000) * 1000;
  return { year, month, day, weekday: WEEKDAYS.indexOf(part("weekday")), offset };
}

/** The instant midnight starts on a wall-clock date in `timeZone`. */
function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  let instant = utcMidnight - zonedDate(new Date(utcMidnight), timeZone).offset;
  // The offset at midnight itself can differ from a few hours away (DST).
  instant = utcMidnight - zonedDate(new Date(instant), timeZone).offset;
  return new Date(instant);
}

/**
 * `startOfWeek` on the user's own calendar rather than the runtime's: the
 * MCP server runs in UTC, so a Sunday-evening set in Los Angeles is Monday
 * there (issue #511).
 */
function zonedStartOfWeek(date: Date, weekStart: number, timeZone: string): Date {
  const { year, month, day, weekday } = zonedDate(date, timeZone);
  const daysSinceWeekStart = (weekday - weekStart + 7) % 7;
  return zonedMidnight(year, month, day - daysSinceWeekStart, timeZone);
}

export interface WeekGroup<T> {
  weekStart: Date;
  items: T[];
}

/** Groups arbitrary dated items by the week (per `startOfWeek`) they fall in, newest week first. */
export function groupByWeek<T>(
  items: readonly T[],
  weekStart: number,
  getDate: (item: T) => Date,
  timeZone?: string,
): WeekGroup<T>[] {
  const groups = new Map<number, T[]>();

  for (const item of items) {
    const key = startOfWeek(getDate(item), weekStart, timeZone).getTime();
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([time, groupItems]) => ({ weekStart: new Date(time), items: groupItems }));
}
