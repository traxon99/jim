import type { OneRepMaxPoint } from "@jim/core";

const WIDTH = 320;
const HEIGHT = 120;
const PADDING = 10;

/**
 * "Per-exercise history with an estimated-1RM-over-time chart" (STORIES.md
 * S7). Points are time-proportional along x (not just evenly spaced by
 * index), so a gap in training shows up as a gap in the line. Colored with
 * `currentColor` off the wrapping text color, so it stays legible in both
 * themes without a second, dark-mode-specific palette to keep in sync.
 */
export function OneRepMaxChart({ points }: { points: OneRepMaxPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Not enough history yet to chart a trend.
      </p>
    );
  }

  const values = points.map((point) => point.estimatedOneRepMax);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueSpan = maxValue - minValue || 1;

  const times = points.map((point) => point.date.getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;

  function x(point: OneRepMaxPoint): number {
    if (points.length === 1) return WIDTH / 2;
    return PADDING + ((point.date.getTime() - minTime) / timeSpan) * (WIDTH - PADDING * 2);
  }

  function y(point: OneRepMaxPoint): number {
    return (
      HEIGHT -
      PADDING -
      ((point.estimatedOneRepMax - minValue) / valueSpan) * (HEIGHT - PADDING * 2)
    );
  }

  const path = points
    .map(
      (point, index) => `${index === 0 ? "M" : "L"}${x(point).toFixed(1)},${y(point).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div className="text-zinc-900 dark:text-zinc-50">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Estimated one-rep max over time"
      >
        <line
          x1={PADDING}
          y1={HEIGHT - PADDING}
          x2={WIDTH - PADDING}
          y2={HEIGHT - PADDING}
          stroke="currentColor"
          strokeOpacity={0.15}
        />
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point) => (
          <circle key={point.sessionId} cx={x(point)} cy={y(point)} r={2.5} fill="currentColor" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
        <span>{points[0]?.date.toLocaleDateString()}</span>
        <span>Best: {Math.round(maxValue).toLocaleString()}</span>
        <span>{points[points.length - 1]?.date.toLocaleDateString()}</span>
      </div>
    </div>
  );
}
