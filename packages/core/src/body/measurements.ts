import { type WeightUnit, convertWeight } from "../data-transfer/workout-csv";

/**
 * Body measurements over time (issue #249). Every entry is one
 * `body_measurements` row: a `kind`, a value, and the unit it was entered
 * in. Bodyweight is a weight, body-fat is a percentage, and the rest are
 * circumferences in inches or centimetres.
 */

export const MEASUREMENT_KINDS = [
  "bodyweight",
  "body_fat",
  "neck",
  "chest",
  "waist",
  "hips",
  "arms",
  "thighs",
  "calves",
] as const;

export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export type LengthUnit = "in" | "cm";
export type MeasurementUnit = WeightUnit | LengthUnit | "pct";
export type MeasurementDimension = "weight" | "length" | "percent";

export const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  bodyweight: "Bodyweight",
  body_fat: "Body fat",
  neck: "Neck",
  chest: "Chest",
  waist: "Waist",
  hips: "Hips",
  arms: "Arms",
  thighs: "Thighs",
  calves: "Calves",
};

export function isMeasurementKind(kind: string): kind is MeasurementKind {
  return (MEASUREMENT_KINDS as readonly string[]).includes(kind);
}

export function measurementDimension(kind: MeasurementKind): MeasurementDimension {
  if (kind === "bodyweight") return "weight";
  if (kind === "body_fat") return "percent";
  return "length";
}

/** Inches for a pounds user, centimetres for a kilos user. */
export function lengthUnitFor(units: WeightUnit): LengthUnit {
  return units === "lb" ? "in" : "cm";
}

/** The unit a kind is entered and shown in for a user on `units`. */
export function displayUnitFor(kind: MeasurementKind, units: WeightUnit): MeasurementUnit {
  const dimension = measurementDimension(kind);
  if (dimension === "weight") return units;
  if (dimension === "percent") return "pct";
  return lengthUnitFor(units);
}

const CM_PER_IN = 2.54;

/** Rounded to 2 decimals, the precision `body_measurements.value` stores. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  const converted = from === "in" ? value * CM_PER_IN : value / CM_PER_IN;
  return Math.round(converted * 100) / 100;
}

/**
 * `value` in `from` converted to `to`, or null when the two units measure
 * different things (a row stored in the wrong dimension is skipped rather
 * than shown as nonsense).
 */
export function convertMeasurement(
  value: number,
  from: MeasurementUnit,
  to: MeasurementUnit,
): number | null {
  if (from === to) return value;
  if ((from === "lb" || from === "kg") && (to === "lb" || to === "kg")) {
    return convertWeight(value, from, to);
  }
  if ((from === "in" || from === "cm") && (to === "in" || to === "cm")) {
    return convertLength(value, from, to);
  }
  return null;
}

/** Display suffix: "lb", "kg", "in", "cm" or "%". */
export function measurementUnitLabel(unit: MeasurementUnit): string {
  return unit === "pct" ? "%" : unit;
}
