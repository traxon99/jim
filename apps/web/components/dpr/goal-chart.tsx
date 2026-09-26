import { goalChartGeometry } from "@/lib/dpr/chart";
import type { E1rmPoint } from "@jim/core";

/**
 * A lift's RPE-adjusted e1RM against the block's straight baseline→goal line
 * (issue #214). Both series are ink, not hue: solid for the lifter, dashed
 * for the goal, with a legend — same `currentColor` approach as
 * OneRepMaxChart so it reads in both themes. Each point has a hover title.
 */
export function GoalChart({
  series,
  block,
  goal,
  units,
}: {
  series: readonly E1rmPoint[];
  block: { startedAt: Date; endsAt: Date };
  goal: { baselineE1rm: number | null; goalE1rm: number | null };
  units: string;
}) {
  const geometry = goalChartGeometry(series, block, goal);
  if (geometry.points.length === 0 && !geometry.goalLine) return null;
  const { width, height, points, path, goalLine } = geometry;
  const last = points.at(-1);

  return (
    <figure className="flex flex-col gap-1 text-zinc-900 dark:text-zinc-50">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Estimated 1RM ${last ? `now ${Math.round(last.e1rm)} ${units}` : "not logged yet"}${goal.goalE1rm === null ? "" : `, goal ${Math.round(goal.goalE1rm)} ${units}`}`}
      >
        {goalLine && (
          <line
            {...goalLine}
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
        )}
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
        {points.map((point) => (
          <g key={point.date.getTime()}>
            <circle cx={point.x} cy={point.y} r={4} fill="currentColor" />
            {/* Hit target bigger than the mark, carrying the hover title. */}
            <circle cx={point.x} cy={point.y} r={10} fill="transparent">
              <title>
                {`${point.date.toLocaleDateString()} · e1RM ${Math.round(point.e1rm)} ${units}`}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
        <span className="flex items-center gap-1">
          <svg width="16" height="4" aria-hidden="true" className="text-zinc-900 dark:text-zinc-50">
            <line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" />
          </svg>
          e1RM
        </span>
        {goalLine && (
          <span className="flex items-center gap-1">
            <svg
              width="16"
              height="4"
              aria-hidden="true"
              className="text-zinc-900 dark:text-zinc-50"
            >
              <line
                x1="0"
                y1="2"
                x2="16"
                y2="2"
                stroke="currentColor"
                strokeOpacity={0.45}
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </svg>
            Goal pace
          </span>
        )}
      </figcaption>
    </figure>
  );
}
