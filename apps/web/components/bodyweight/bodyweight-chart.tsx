import type { MeasurementPoint } from "@/lib/bodyweight";

const WIDTH = 320;
const HEIGHT = 140;
const PADDING = 10;
/** Weigh-ins swing a kilo or two day to day; the trend is the 7-day average. */
const BODYWEIGHT_TREND_DAYS = 7;
const DAY_MS = 86_400_000;

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Each point's average over the trailing `days` days of entries. */
function trailingAverage(points: readonly MeasurementPoint[], days: number): number[] {
  return points.map((point, index) => {
    const from = point.measuredAt.getTime() - (days - 1) * DAY_MS;
    let sum = 0;
    let count = 0;
    for (let i = index; i >= 0; i--) {
      const earlier = points[i];
      if (!earlier || earlier.measuredAt.getTime() < from) break;
      sum += earlier.value;
      count++;
    }
    return count === 0 ? point.value : sum / count;
  });
}

/**
 * Bodyweight over time (issue #377): each weigh-in as a dot, with the 7-day
 * average as the line, since that's what shows the real trend under daily
 * water-weight noise.
 */
export function BodyweightChart({ points }: { points: readonly MeasurementPoint[] }) {
  return (
    <TrendChart
      points={points}
      label="Bodyweight"
      trendDays={BODYWEIGHT_TREND_DAYS}
      emptyText="No weigh-ins in this range yet."
    />
  );
}

/**
 * One measurement over time (issues #377, #249). Time-proportional along x
 * and drawn in `currentColor`, like the e1RM chart, so it reads in both
 * themes. With `trendDays` the line is that trailing average; without it the
 * line joins the entries, which suits measurements taken weeks apart. A
 * single entry draws as one dot with a nudge to log another.
 */
export function TrendChart({
  points,
  label,
  trendDays = null,
  emptyText,
}: {
  points: readonly MeasurementPoint[];
  label: string;
  trendDays?: number | null;
  emptyText: string;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-500">{emptyText}</p>;
  }

  const trend = trendDays ? trailingAverage(points, trendDays) : points.map((p) => p.value);
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueSpan = maxValue - minValue || 1;

  const times = points.map((point) => point.measuredAt.getTime());
  const minTime = Math.min(...times);
  const timeSpan = Math.max(...times) - minTime || 1;

  function x(point: MeasurementPoint): number {
    if (points.length === 1) return WIDTH / 2;
    return PADDING + ((point.measuredAt.getTime() - minTime) / timeSpan) * (WIDTH - PADDING * 2);
  }

  function y(value: number): number {
    if (maxValue === minValue) return HEIGHT / 2;
    return HEIGHT - PADDING - ((value - minValue) / valueSpan) * (HEIGHT - PADDING * 2);
  }

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(point).toFixed(1)},${y(trend[index] ?? point.value).toFixed(1)}`,
    )
    .join(" ");

  // Without a trailing average the dots are the data, so draw them solid.
  const dotOpacity = trendDays ? 0.35 : 1;
  const caption =
    points.length === 1
      ? "Log another to see a trend"
      : trendDays
        ? `Line: ${trendDays}-day average`
        : null;

  return (
    <div className="text-zinc-900 dark:text-zinc-50">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${label} over time, ranging from ${formatValue(minValue)} to ${formatValue(maxValue)}`}
      >
        {[maxValue, minValue].map((value, index) =>
          index === 1 && maxValue === minValue ? null : (
            <g key={value}>
              <line
                x1={PADDING}
                y1={y(value)}
                x2={WIDTH - PADDING}
                y2={y(value)}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeDasharray="2 3"
              />
              <text
                x={PADDING}
                y={index === 0 ? y(value) + 9 : y(value) - 3}
                fontSize={9}
                fill="currentColor"
                opacity={0.55}
              >
                {formatValue(value)}
              </text>
            </g>
          ),
        )}
        {points.map((point) => (
          <circle
            key={point.id}
            cx={x(point)}
            cy={y(point.value)}
            r={trendDays ? 2 : 3}
            fill="currentColor"
            opacity={dotOpacity}
          />
        ))}
        {points.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-500">
        <span>{points[0]?.measuredAt.toLocaleDateString()}</span>
        {caption && <span className="min-w-0 truncate text-center">{caption}</span>}
        {points.length > 1 && (
          <span>{points[points.length - 1]?.measuredAt.toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}
