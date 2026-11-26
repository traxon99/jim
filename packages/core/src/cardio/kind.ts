import { type DistanceUnit, formatDuration } from "./format";

/**
 * What sort of cardio an exercise is (issue #872), read from its slug and
 * name like `stravaSportForCardio`. Each kind picks the unit people think in
 * and the number they chase: a run's pace per mile, a row's split per 500 m,
 * a swim's time per 100 m, a ride's speed.
 */
export type CardioKind =
  | "run"
  | "walk"
  | "ride"
  | "row"
  | "ski"
  | "swim"
  | "elliptical"
  | "stairs"
  | "boxing"
  | "rope"
  | "other";

/** The third column next to distance and time. */
export type CardioMetric = "pace" | "split500" | "per100" | "speed";

export interface CardioProfile {
  kind: CardioKind;
  /** Whether distance is entered and shown in meters instead of the user's mi/km. */
  meters: boolean;
  metric: CardioMetric;
  /** "Round" for bag work, where each set is a round. */
  setLabel: "Set" | "Round";
  /** "run", "ride": the noun in "Longest run". */
  noun: string;
}

const RULES: readonly [RegExp, CardioKind][] = [
  [/\bski\s?erg|\bski\b/, "ski"],
  [/\b(row|rowing|rower|erg)\b/, "row"],
  [/\b(swim|swimming|laps|pool)\b/, "swim"],
  [/\b(bike|biking|bicycl\w*|cycl\w*|ride|riding|spin)\b/, "ride"],
  [/\belliptical\b/, "elliptical"],
  [/\b(stair\w*|step mill|stepper)\b/, "stairs"],
  [/\b(boxing|bag work|heavy bag)\b/, "boxing"],
  [/\b(rope|skipping)\b/, "rope"],
  [/\b(run|running|jog|jogging|sprint)\b/, "run"],
  [/\b(walk|walking|hike|hiking)\b/, "walk"],
];

export function cardioKindOf(exercise: { name: string; slug?: string | null }): CardioKind {
  const text = `${(exercise.slug ?? "").replaceAll("-", " ")} ${exercise.name}`.toLowerCase();
  for (const [pattern, kind] of RULES) if (pattern.test(text)) return kind;
  return "other";
}

const NOUNS: Record<CardioKind, string> = {
  run: "run",
  walk: "walk",
  ride: "ride",
  row: "row",
  ski: "ski",
  swim: "swim",
  elliptical: "session",
  stairs: "climb",
  boxing: "round",
  rope: "session",
  other: "session",
};

export function cardioProfile(kind: CardioKind): CardioProfile {
  const meters = kind === "row" || kind === "ski" || kind === "swim";
  const metric: CardioMetric =
    kind === "row" || kind === "ski"
      ? "split500"
      : kind === "swim"
        ? "per100"
        : kind === "ride" || kind === "elliptical"
          ? "speed"
          : "pace";
  return { kind, meters, metric, setLabel: kind === "boxing" ? "Round" : "Set", noun: NOUNS[kind] };
}

export const METERS_PER_UNIT: Record<DistanceUnit, number> = { km: 1000, mi: 1609.344 };

/** A stored distance (in the user's mi/km) in meters. */
export function distanceToMeters(distance: number, unit: DistanceUnit): number {
  return distance * METERS_PER_UNIT[unit];
}

/** Meters as a stored distance, to the column's four decimals (about 0.2 m). */
export function metersToDistance(meters: number, unit: DistanceUnit): number {
  return Math.round((meters / METERS_PER_UNIT[unit]) * 10_000) / 10_000;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The distance column's label: "mi", "km" or "m". */
export function cardioDistanceUnitLabel(profile: CardioProfile, unit: DistanceUnit): string {
  return profile.meters ? "m" : unit;
}

/** A stored distance as the number the card shows: "3.1" or "2,000". */
export function cardioDistanceValue(
  distance: number | string | null | undefined,
  unit: DistanceUnit,
  profile: CardioProfile,
): string | null {
  const d = toNumber(distance);
  if (d == null) return null;
  if (profile.meters) return Math.round(distanceToMeters(d, unit)).toLocaleString("en-US");
  return String(Number(d.toFixed(2)));
}

/** "3.1 mi", "2,000 m". */
export function formatCardioDistance(
  distance: number | string | null | undefined,
  unit: DistanceUnit,
  profile: CardioProfile,
): string | null {
  const value = cardioDistanceValue(distance, unit, profile);
  return value == null ? null : `${value} ${cardioDistanceUnitLabel(profile, unit)}`;
}

/** What the user typed in the distance box, as the stored distance. */
export function cardioInputToDistance(
  value: number,
  unit: DistanceUnit,
  profile: CardioProfile,
): number {
  return profile.meters ? metersToDistance(value, unit) : Math.round(value * 100) / 100;
}

/** The metric column's header: "/mi", "/500m", "/100m", "mph". */
export function cardioMetricLabel(profile: CardioProfile, unit: DistanceUnit): string {
  switch (profile.metric) {
    case "split500":
      return "/500m";
    case "per100":
      return "/100m";
    case "speed":
      return unit === "km" ? "km/h" : "mph";
    default:
      return `/${unit}`;
  }
}

/**
 * The metric for a distance in a time: "8:25" (pace), "2:04" (split),
 * "1:42" (per 100 m) or "16.3" (speed). Null without both.
 */
export function cardioMetricValue(
  durationSeconds: number | null | undefined,
  distance: number | string | null | undefined,
  unit: DistanceUnit,
  profile: CardioProfile,
): string | null {
  const d = toNumber(distance);
  if (d == null || durationSeconds == null || durationSeconds <= 0) return null;
  const meters = distanceToMeters(d, unit);
  const secondsPerMeter = durationSeconds / meters;
  return formatCardioMetric(secondsPerMeter, unit, profile);
}

/** A pace in seconds per meter, in the profile's metric. */
export function formatCardioMetric(
  secondsPerMeter: number,
  unit: DistanceUnit,
  profile: CardioProfile,
): string {
  switch (profile.metric) {
    case "split500":
      return formatDuration(secondsPerMeter * 500);
    case "per100":
      return formatDuration(secondsPerMeter * 100);
    case "speed": {
      const perHour = 3600 / (secondsPerMeter * METERS_PER_UNIT[unit]);
      return perHour.toFixed(1);
    }
    default:
      return formatDuration(secondsPerMeter * METERS_PER_UNIT[unit]);
  }
}

/** A logged cardio set as one line in its own units: "3.1 mi · 26:05", "2,000 m · 8:05", "3:00". */
export function formatCardioSetFor(
  set: { distance: number | string | null; durationSeconds: number | null },
  unit: DistanceUnit,
  profile: CardioProfile,
): string {
  const parts: string[] = [];
  const distance = formatCardioDistance(set.distance, unit, profile);
  if (distance) parts.push(distance);
  if (set.durationSeconds != null && set.durationSeconds > 0) {
    parts.push(formatDuration(set.durationSeconds));
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}
