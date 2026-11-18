import { TrendChart } from "@/components/charts/trend-chart";
import type { MeasurementPoint } from "@/lib/bodyweight";
import { BODYWEIGHT_TREND_DAYS, type WeightUnit } from "@jim/core";

export { BODYWEIGHT_TREND_DAYS };

/**
 * Bodyweight over time (issue #377): each weigh-in as a dot, and the 7-day
 * average as a shaded likely range (issue #825) covering scale error and the
 * daily water swing, since no single weigh-in is your real weight.
 */
export function BodyweightChart({
  points,
  unit,
}: {
  points: readonly MeasurementPoint[];
  unit: WeightUnit;
}) {
  return (
    <TrendChart
      points={points}
      label="Bodyweight"
      unit={unit}
      trendDays={BODYWEIGHT_TREND_DAYS}
      rangeUnit={unit}
      emptyText="No weigh-ins in this range yet."
      size="compact"
    />
  );
}
