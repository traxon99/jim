import { TrendChart } from "@/components/charts/trend-chart";
import type { MeasurementPoint } from "@/lib/bodyweight";

/** Weigh-ins swing a kilo or two day to day; the trend is the 7-day average. */
export const BODYWEIGHT_TREND_DAYS = 7;

/**
 * Bodyweight over time (issue #377): each weigh-in as a dot, with the 7-day
 * average as the line, since that's what shows the real trend under daily
 * water-weight noise.
 */
export function BodyweightChart({
  points,
  unit,
}: {
  points: readonly MeasurementPoint[];
  unit: string;
}) {
  return (
    <TrendChart
      points={points}
      label="Bodyweight"
      unit={unit}
      trendDays={BODYWEIGHT_TREND_DAYS}
      emptyText="No weigh-ins in this range yet."
      size="compact"
    />
  );
}
