import type { WeightUnit } from "../data-transfer/workout-csv";

/**
 * A weigh-in isn't your weight (issue #825): the scale reads a little off and
 * water swings you a kilo or two from one day to the next. So the chart draws
 * a likely range around the trend instead of one hard line, the way the pace
 * chart shades its "on pace" zone.
 */

const DAY_MS = 86_400_000;

/** Weigh-ins swing day to day; the trend is the 7-day average. */
export const BODYWEIGHT_TREND_DAYS = 7;

/** A home scale's typical error, as a half-width in each unit. */
export const SCALE_ACCURACY: Record<WeightUnit, number> = { kg: 0.2, lb: 0.5 };

/**
 * The water swing assumed when there are too few weigh-ins in the window to
 * measure it: about 1% of bodyweight either side.
 */
export const DEFAULT_WATER_FRACTION = 0.01;

/** Weigh-ins needed in the window before their own spread is trusted. */
export const MIN_READINGS_FOR_SPREAD = 3;

export interface TimedValue {
  measuredAt: Date;
  value: number;
}

export interface WeightRangePoint {
  /** The trailing average: the middle of the range. */
  mid: number;
  low: number;
  high: number;
}

/** Each point's average over the trailing `days` days of entries. */
export function trailingAverage(points: readonly TimedValue[], days: number): number[] {
  return points.map((_, index) => {
    const window = trailingWindow(points, index, days);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

/** The values from the trailing `days` days up to and including `index`. */
function trailingWindow(points: readonly TimedValue[], index: number, days: number): number[] {
  const point = points[index];
  if (!point) return [];
  const from = point.measuredAt.getTime() - (days - 1) * DAY_MS;
  const values: number[] = [];
  for (let i = index; i >= 0; i--) {
    const earlier = points[i];
    if (!earlier || earlier.measuredAt.getTime() < from) break;
    values.push(earlier.value);
  }
  return values;
}

/**
 * The likely bodyweight range at each weigh-in: the trailing average, give or
 * take the scale's error and the water swing combined (in quadrature, since
 * they're independent). The water swing is the spread (standard deviation) of
 * the weigh-ins in the window once there are enough of them, and about 1% of
 * bodyweight before that. Oldest first, like `points`.
 */
export function bodyweightRange(
  points: readonly TimedValue[],
  days: number,
  unit: WeightUnit,
): WeightRangePoint[] {
  const scale = SCALE_ACCURACY[unit];
  return points.map((_, index) => {
    const window = trailingWindow(points, index, days);
    const mid = window.reduce((sum, value) => sum + value, 0) / window.length;
    let water = mid * DEFAULT_WATER_FRACTION;
    if (window.length >= MIN_READINGS_FOR_SPREAD) {
      const variance =
        window.reduce((sum, value) => sum + (value - mid) ** 2, 0) / (window.length - 1);
      water = Math.sqrt(variance);
    }
    const halfWidth = Math.sqrt(scale ** 2 + water ** 2);
    return { mid, low: mid - halfWidth, high: mid + halfWidth };
  });
}
