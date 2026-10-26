import { dateKey } from "../history/training-calendar";

/**
 * Injuries and pain check-ins live on calendar days, YYYY-MM-DD (issue
 * #627). The phone uses its own zone; the server passes the user's stored
 * IANA zone (issue #511).
 */
export function dayKey(date: Date, timeZone?: string): string {
  if (!timeZone) return dateKey(date);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `value` is a real calendar day written YYYY-MM-DD. */
export function isDayKey(value: string): boolean {
  if (!DAY_KEY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** e.g. "Oct 12" (or "Oct 12, 2025" outside `today`'s year), for a YYYY-MM-DD day. */
export function formatDayKey(day: string, today?: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const sameYear = today ? today.slice(0, 4) === day.slice(0, 4) : true;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
