import { dayKey, isValidTimeZone } from "@jim/core";

/** The user's stored zone if it's a real IANA zone, else UTC (issue #511). */
export function userZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
}

/** `YYYY-MM-DD` of `date` in `timeZone`. */
export function dayIn(date: Date, timeZone: string): string {
  return dayKey(date, timeZone);
}

/**
 * A Date whose *local* fields (getFullYear, getDate, getDay…) read the wall
 * clock in `timeZone` at `date`. For @jim/core helpers written for the phone,
 * which do calendar math in the runtime's own zone: feed them these and they
 * work in the user's zone whatever zone the server runs in.
 */
export function asWallClock(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
}

/** `YYYY-MM-DD` of a Date made by `asWallClock` (or a local start of day from one). */
export function wallClockDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
