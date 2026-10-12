import {
  type AnalysisRange,
  type AnalysisSet,
  type OneRepMaxPoint,
  analysisRangeStart,
  estimatedOneRepMaxSeries,
} from "@jim/core";

/** How many lifts one Compare chart overlays before it stops being readable. */
export const MAX_COMPARE_LIFTS = 5;

/** How many lifts the chart starts with when the URL names none. */
const DEFAULT_COMPARE_LIFTS = 2;

const DATE_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A `?from=`/`?to=` value as local midnight of that day, or null when it is
 * missing or not a real `YYYY-MM-DD` date (so "2026-02-31" is ignored).
 */
export function parseDateParam(value: string | null | undefined): Date | null {
  const match = value ? DATE_PARAM.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** A local date as the `YYYY-MM-DD` a date input and the URL use. */
export function formatDateParam(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The instants a chart covers: `start` inclusive, `end` exclusive, null for open. */
export interface CompareWindow {
  start: Date | null;
  end: Date | null;
  /** True when the dates came from `from`/`to` rather than the range picker. */
  custom: boolean;
}

/**
 * The chart's window. A custom `from` or `to` wins over the range picker;
 * `to` includes that whole day. Dates in the wrong order are swapped rather
 * than showing an empty chart.
 */
export function compareWindow(
  range: AnalysisRange,
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date,
): CompareWindow {
  let start = parseDateParam(from);
  let last = parseDateParam(to);
  if (!start && !last) return { start: analysisRangeStart(range, now), end: null, custom: false };
  if (start && last && start > last) [start, last] = [last, start];
  const end = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) : null;
  return { start, end, custom: true };
}

export interface CompareLift {
  exerciseId: string;
  /** Per-session best estimated 1RM, oldest first, in every session ever. */
  points: OneRepMaxPoint[];
}

/**
 * Every lift with at least one weighted set, as an e1RM series built the same
 * way the Exercises chart builds it, most-trained first. Callers pass working
 * strength sets only; cardio and warm-ups never reach here.
 */
export function compareLifts(sets: readonly AnalysisSet[]): CompareLift[] {
  const byExercise = new Map<string, AnalysisSet[]>();
  for (const set of sets) {
    const list = byExercise.get(set.exerciseId) ?? [];
    list.push(set);
    byExercise.set(set.exerciseId, list);
  }
  const lifts: CompareLift[] = [];
  for (const [exerciseId, exerciseSets] of byExercise) {
    const points = estimatedOneRepMaxSeries(exerciseSets);
    if (points.length > 0) lifts.push({ exerciseId, points });
  }
  return lifts.sort(
    (a, b) =>
      b.points.length - a.points.length ||
      (b.points.at(-1)?.date.getTime() ?? 0) - (a.points.at(-1)?.date.getTime() ?? 0),
  );
}

/**
 * The lifts a `?lifts=a,b` value names, in its order, keeping only ones that
 * exist and capped at `MAX_COMPARE_LIFTS`. With none named, the most-trained
 * lifts.
 */
export function parseLiftsParam(
  value: string | null | undefined,
  available: readonly string[],
): string[] {
  if (!value) return available.slice(0, DEFAULT_COMPARE_LIFTS);
  const known = new Set(available);
  const ids: string[] = [];
  for (const id of value.split(",")) {
    if (known.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_COMPARE_LIFTS);
}

export interface CompareSeries {
  exerciseId: string;
  /** The points inside the window, oldest first. */
  points: OneRepMaxPoint[];
  /** Latest minus first in-window e1RM; null with fewer than two points. */
  change: number | null;
  /** Null when there is no change or the first estimate is 0. */
  changePercent: number | null;
  best: number | null;
}

/** Each chosen lift's points within the window, with its change across it. */
export function compareSeries(
  lifts: readonly CompareLift[],
  exerciseIds: readonly string[],
  window: Pick<CompareWindow, "start" | "end">,
): CompareSeries[] {
  const byId = new Map(lifts.map((lift) => [lift.exerciseId, lift]));
  return exerciseIds.map((exerciseId) => {
    const points = (byId.get(exerciseId)?.points ?? []).filter(
      (point) =>
        (!window.start || point.date >= window.start) && (!window.end || point.date < window.end),
    );
    const first = points[0];
    const last = points.at(-1);
    const change =
      first && last && points.length > 1
        ? last.estimatedOneRepMax - first.estimatedOneRepMax
        : null;
    return {
      exerciseId,
      points,
      change,
      changePercent:
        change != null && first && first.estimatedOneRepMax > 0
          ? (change / first.estimatedOneRepMax) * 100
          : null,
      best: points.length > 0 ? Math.max(...points.map((point) => point.estimatedOneRepMax)) : null,
    };
  });
}
