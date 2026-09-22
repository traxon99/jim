export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** 0..6 starting from the user's configured first day of the week. */
export function weekdaysFrom(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
}
