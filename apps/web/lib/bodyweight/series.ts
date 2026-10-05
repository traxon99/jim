import type { BodyMeasurementRow } from "@/lib/db/schema";
import {
  type MeasurementKind,
  type MeasurementUnit,
  type WeightUnit,
  convertMeasurement,
} from "@jim/core";

export const BODYWEIGHT_KIND = "bodyweight";

export interface BodyweightPoint {
  id: string;
  measuredAt: Date;
  /** In the units asked for, to two decimals. */
  value: number;
}

/** A point on any measurement's trend (issue #249); same shape as a weigh-in. */
export type MeasurementPoint = BodyweightPoint;

function isLive(row: BodyMeasurementRow, kind: MeasurementKind): boolean {
  return row.kind === kind && !row.deletedAt;
}

export function isLiveBodyweight(
  row: BodyMeasurementRow,
): row is BodyMeasurementRow & { unit: WeightUnit } {
  return isLive(row, BODYWEIGHT_KIND) && (row.unit === "lb" || row.unit === "kg");
}

/**
 * Live entries of one kind in `unit`, oldest first. Rows whose unit can't
 * convert to it (a length logged against a weight kind) are left out.
 */
export function measurementSeries(
  rows: readonly BodyMeasurementRow[],
  kind: MeasurementKind,
  unit: MeasurementUnit,
): MeasurementPoint[] {
  const points: MeasurementPoint[] = [];
  for (const row of rows) {
    if (!isLive(row, kind)) continue;
    const value = convertMeasurement(Number(row.value), row.unit, unit);
    if (value == null || !Number.isFinite(value)) continue;
    points.push({ id: row.id, measuredAt: row.measuredAt, value });
  }
  return points.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}

/** Live weigh-ins in `units`, oldest first. */
export function bodyweightSeries(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): BodyweightPoint[] {
  return measurementSeries(rows, BODYWEIGHT_KIND, units);
}

/**
 * The bodyweight that applied on a date: the last weigh-in on or before it,
 * or the first one for dates before any (issue #247). `series` is oldest
 * first, as `bodyweightSeries` returns it. Null with no weigh-ins.
 */
export function bodyweightOnDate(
  series: readonly BodyweightPoint[],
): (date: Date) => number | null {
  return (date) => {
    const time = date.getTime();
    let lo = 0;
    let hi = series.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((series[mid] as BodyweightPoint).measuredAt.getTime() <= time) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return series[Math.max(found, 0)]?.value ?? null;
  };
}

/** `bodyweightOnDate` straight from the rows, in `units`. */
export function bodyweightLookup(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): (date: Date) => number | null {
  return bodyweightOnDate(bodyweightSeries(rows, units));
}
