import type { E1rmPoint } from "@jim/core";

export interface GoalChartGeometry {
  width: number;
  height: number;
  /** The lifter's e1RM, one point per eligible session. */
  points: { x: number; y: number; date: Date; e1rm: number }[];
  path: string;
  /** Straight line from baseline at block start to goal at block end. */
  goalLine: { x1: number; y1: number; x2: number; y2: number } | null;
  min: number;
  max: number;
}

const WIDTH = 320;
const HEIGHT = 120;
const PAD = 10;

/**
 * Geometry for a lift's e1RM-vs-goal chart (issue #214): time-proportional x
 * over the block (plus any sessions logged before it started), one shared
 * y scale covering both the series and the goal line.
 */
export function goalChartGeometry(
  series: readonly E1rmPoint[],
  block: { startedAt: Date; endsAt: Date },
  goal: { baselineE1rm: number | null; goalE1rm: number | null },
): GoalChartGeometry {
  const times = [
    block.startedAt.getTime(),
    block.endsAt.getTime(),
    ...series.map((p) => p.date.getTime()),
  ];
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const values = [
    ...series.map((p) => p.e1rm),
    ...(goal.baselineE1rm === null ? [] : [goal.baselineE1rm]),
    ...(goal.goalE1rm === null ? [] : [goal.goalE1rm]),
  ];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || 1;

  const x = (t: number) => PAD + ((t - t0) / (t1 - t0 || 1)) * (WIDTH - PAD * 2);
  const y = (v: number) => HEIGHT - PAD - ((v - min) / span) * (HEIGHT - PAD * 2);
  const round = (n: number) => Math.round(n * 10) / 10;

  const points = [...series]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((p) => ({
      x: round(x(p.date.getTime())),
      y: round(y(p.e1rm)),
      date: p.date,
      e1rm: p.e1rm,
    }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const goalLine =
    goal.baselineE1rm === null || goal.goalE1rm === null
      ? null
      : {
          x1: round(x(block.startedAt.getTime())),
          y1: round(y(goal.baselineE1rm)),
          x2: round(x(block.endsAt.getTime())),
          y2: round(y(goal.goalE1rm)),
        };
  return { width: WIDTH, height: HEIGHT, points, path, goalLine, min, max };
}
