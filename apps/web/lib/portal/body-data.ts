import {
  TRACKED_MEASUREMENT_KINDS,
  type TrackedMeasurementKind,
  bodyweightSeries,
  measurementSeries,
} from "@/lib/bodyweight/series";
import type { BodyMeasurementRow } from "@/lib/db/schema";
import { type WeightUnit, displayUnitFor } from "@jim/core";

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
  /** Each measurement's entries in its display unit (`displayUnitFor`), oldest first. */
  measurements: Record<TrackedMeasurementKind, PortalBodyPoint[]>;
}

function serialize(points: readonly { id: string; measuredAt: Date; value: number }[]) {
  return points.map((point) => ({
    id: point.id,
    measuredAt: point.measuredAt.toISOString(),
    value: point.value,
  }));
}

/**
 * Live weigh-ins and measurements in the user's units, oldest first: the
 * same series the phone's Bodyweight and Measurements pages draw.
 */
export function buildPortalBodyData(
  rows: readonly BodyMeasurementRow[],
  units: WeightUnit,
): PortalBodyData {
  const measurements = Object.fromEntries(
    TRACKED_MEASUREMENT_KINDS.map((kind) => [
      kind,
      serialize(measurementSeries(rows, kind, displayUnitFor(kind, units))),
    ]),
  ) as Record<TrackedMeasurementKind, PortalBodyPoint[]>;
  return { units, bodyweight: serialize(bodyweightSeries(rows, units)), measurements };
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

/** The phone Measurements page's ranges (issue #249), counted back from the latest entry. */
export const MEASUREMENT_RANGES = [
  { key: "3m", label: "3M", days: 91 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

export type MeasurementRangeKey = (typeof MEASUREMENT_RANGES)[number]["key"];

/** Entries within a measurement range of the latest one, as the phone shows them. */
export function measurementPointsInRange(
  points: readonly TrendPoint[],
  range: MeasurementRangeKey,
): TrendPoint[] {
  const days = MEASUREMENT_RANGES.find((option) => option.key === range)?.days ?? null;
  const latest = points[points.length - 1];
  if (days == null || !latest) return [...points];
  return trendPointsSince(points, new Date(latest.measuredAt.getTime() - days * 86_400_000));
}
