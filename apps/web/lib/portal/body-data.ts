import { bodyweightSeries } from "@/lib/bodyweight/series";
import type { BodyMeasurementRow } from "@/lib/db/schema";
import type { WeightUnit } from "@jim/core";

/** One entry on a body trend, serializable across the server/client boundary. */
export interface PortalBodyPoint {
  id: string;
  measuredAt: string;
  /** Already in the user's display unit. */
  value: number;
}

/** What the Body section (issue #470) shows. */
export interface PortalBodyData {
  units: WeightUnit;
  bodyweight: PortalBodyPoint[];
}

/** Live weigh-ins in the user's units, oldest first, the same series the phone draws. */
export function buildPortalBodyData(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): PortalBodyData {
  return {
    units,
    bodyweight: bodyweightSeries(rows, units).map((point) => ({
      id: point.id,
      measuredAt: point.measuredAt.toISOString(),
      value: point.value,
    })),
  };
}

export interface TrendPoint {
  id: string;
  measuredAt: Date;
  value: number;
}

export interface TrendSummary {
  latest: TrendPoint;
  /** The first entry in the range, which the change is measured from. */
  first: TrendPoint;
  change: number;
  lowest: number;
  highest: number;
  count: number;
}

/** Points as they came from the server, with real dates. */
export function toTrendPoints(points: readonly PortalBodyPoint[]): TrendPoint[] {
  return points.map((point) => ({ ...point, measuredAt: new Date(point.measuredAt) }));
}

/** Entries on or after `since` (all of them when null), oldest first. */
export function trendPointsSince(points: readonly TrendPoint[], since: Date | null): TrendPoint[] {
  if (!since) return [...points];
  const from = since.getTime();
  return points.filter((point) => point.measuredAt.getTime() >= from);
}

/** The headline numbers over a range's entries (oldest first), or null with none. */
export function summarizeTrend(points: readonly TrendPoint[]): TrendSummary | null {
  const first = points[0];
  const latest = points[points.length - 1];
  if (!first || !latest) return null;
  const values = points.map((point) => point.value);
  return {
    latest,
    first,
    change: latest.value - first.value,
    lowest: Math.min(...values),
    highest: Math.max(...values),
    count: points.length,
  };
}
