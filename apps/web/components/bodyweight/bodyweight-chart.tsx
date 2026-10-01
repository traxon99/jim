import type { BodyweightPoint } from "@/lib/bodyweight";

const WIDTH = 320;
const HEIGHT = 140;
const PADDING = 10;
/** Weigh-ins swing a kilo or two day to day; the trend is the 7-day average. */
const TREND_DAYS = 7;
const DAY_MS = 86_400_000;

function formatWeight(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Each point's average over the trailing `TREND_DAYS` days of weigh-ins. */
export function trailingAverage(points: readonly BodyweightPoint[]): number[] {
  return points.map((point, index) => {
    const from = point.measuredAt.getTime() - (TREND_DAYS - 1) * DAY_MS;
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
 * water-weight noise. Time-proportional along x and drawn in
 * `currentColor`, like the e1RM chart, so it reads in both themes.
 */
export function BodyweightChart({ points }: { points: readonly BodyweightPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-500">No weigh-ins in this range yet.</p>
    );
  }

  const trend = trailingAverage(points);
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueSpan = maxValue - minValue || 1;

  const times = points.map((point) => point.measuredAt.getTime());
  const minTime = Math.min(...times);
  const timeSpan = Math.max(...times) - minTime || 1;

  function x(point: BodyweightPoint): number {
    if (points.length === 1) return WIDTH / 2;
    return PADDING + ((point.measuredAt.getTime() - minTime) / timeSpan) * (WIDTH - PADDING * 2);
  }

  function y(value: number): number {
    return HEIGHT - PADDING - ((value - minValue) / valueSpan) * (HEIGHT - PADDING * 2);
  }

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(point).toFixed(1)},${y(trend[index] ?? point.value).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div className="text-zinc-900 dark:text-zinc-50">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Bodyweight over time, ranging from ${formatWeight(minValue)} to ${formatWeight(maxValue)}`}
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
                {formatWeight(value)}
              </text>
            </g>
          ),
        )}
        {points.map((point) => (
          <circle
            key={point.id}
            cx={x(point)}
            cy={y(point.value)}
            r={2}
            fill="currentColor"
            opacity={0.35}
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
      <div className="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
        <span>{points[0]?.measuredAt.toLocaleDateString()}</span>
        <span>Line: 7-day average</span>
        <span>{points[points.length - 1]?.measuredAt.toLocaleDateString()}</span>
      </div>
    </div>
  );
}
