import type { BodyMeasurementRow } from "@/lib/db/schema";
import { type WeightUnit, convertWeight } from "@jim/core";

export const BODYWEIGHT_KIND = "bodyweight";

export interface BodyweightPoint {
  id: string;
  measuredAt: Date;
  /** In the units asked for, to two decimals. */
  value: number;
}

export function isLiveBodyweight(row: BodyMeasurementRow): boolean {
  return row.kind === BODYWEIGHT_KIND && !row.deletedAt;
}

/** Live weigh-ins in `units`, oldest first. */
export function bodyweightSeries(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): BodyweightPoint[] {
  return rows
    .filter(isLiveBodyweight)
    .map((row) => ({
      id: row.id,
      measuredAt: row.measuredAt,
      value: convertWeight(Number(row.value), row.unit, units),
    }))
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
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
