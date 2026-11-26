/** Distances are logged in the unit that matches the user's weight unit: km with kg, miles with lb. */
export type DistanceUnit = "km" | "mi";

export function distanceUnitFor(units: "lb" | "kg" | null | undefined): DistanceUnit {
  return units === "kg" ? "km" : "mi";
}

/** "3:00", "25:07", "1:02:03". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "5 km", "3.1 mi": up to two decimals, no trailing zeros. */
export function formatDistance(distance: number, unit: DistanceUnit): string {
  return `${Number(distance.toFixed(2))} ${unit}`;
}

/** Seconds per km or mile as "8:15 /mi"; null without both a distance and a time. */
export function formatPace(
  durationSeconds: number | null,
  distance: number | null,
  unit: DistanceUnit,
): string | null {
  if (durationSeconds == null || distance == null || durationSeconds <= 0 || distance <= 0) {
    return null;
  }
  return `${formatDuration(durationSeconds / distance)} /${unit}`;
}

export interface CardioSetValues {
  durationSeconds: number | null;
  /** As stored on a set: numeric columns sync as strings. */
  distance: number | string | null;
}

/** A logged cardio set as one line, e.g. "5 km · 25:00" or "3:00". */
export function formatCardioSet(set: CardioSetValues, unit: DistanceUnit): string {
  const distance = set.distance == null ? null : Number(set.distance);
  const parts: string[] = [];
  if (distance != null && Number.isFinite(distance) && distance > 0) {
    parts.push(formatDistance(distance, unit));
  }
  if (set.durationSeconds != null && set.durationSeconds > 0) {
    parts.push(formatDuration(set.durationSeconds));
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * A set logged for time and/or distance, as one short value: "5 km · 25:00"
 * for cardio, or "45s" for a short hold. Null when the set has neither, so
 * callers fall through to their own weight/reps text.
 */
export function formatTimedSet(set: CardioSetValues, unit: DistanceUnit): string | null {
  if (set.distance != null) return formatCardioSet(set, unit);
  if (set.durationSeconds == null) return null;
  return set.durationSeconds < 60 ? `${set.durationSeconds}s` : formatDuration(set.durationSeconds);
}

/**
 * Timer-style time entry (issue #872): digits fill from the right, so typing
 * 2-6-0-5 reads "26:05" and 1-0-8-2-0 reads "1:08:20". A phone's number pad
 * has no colon, so one box of digits stands in for minutes and seconds.
 */
export function durationDigitsText(digits: string): string {
  const clean = digits.replace(/\D/g, "").replace(/^0+/, "").slice(0, 6);
  if (clean === "") return "";
  const padded = clean.padStart(3, "0");
  const seconds = padded.slice(-2);
  const rest = padded.slice(0, -2);
  if (rest.length <= 2) return `${Number(rest)}:${seconds}`;
  return `${Number(rest.slice(0, -2))}:${rest.slice(-2)}:${seconds}`;
}

/** The seconds a timer-style entry stands for, or null when empty. */
export function durationFromDigits(digits: string): number | null {
  const text = durationDigitsText(digits);
  if (text === "") return null;
  const parts = text.split(":").map(Number);
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : null;
}
