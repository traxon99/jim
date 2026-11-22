"use client";

import { ChevronDown } from "@/components/icons/solar";
import {
  type PaceCalibration,
  type PaceExercise,
  type PacePoint,
  type PaceStatus,
  computePace,
} from "@jim/core";
import { useEffect, useId, useState } from "react";

const WIDTH = 320;
const HEIGHT = 112;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

const TICK_MS = 10_000;

const STATUS_STYLE: Record<PaceStatus, { label: string; tone: string }> = {
  "on-pace": {
    label: "On pace",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  behind: {
    label: "Behind pace",
    tone: "text-amber-600 dark:text-amber-400",
  },
  ahead: {
    label: "Ahead of plan",
    tone: "text-sky-600 dark:text-sky-400",
  },
  done: {
    label: "All sets done",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
};

/** Past this many planned sets the bar is one continuous fill, not segments. */
const MAX_SEGMENTS = 30;

function formatMinutes(seconds: number): string {
  const minutes = Math.round(Math.abs(seconds) / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function formatDelta(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes === 0) return "±0 min";
  return `${minutes > 0 ? "+" : "−"}${Math.abs(minutes)} min`;
}

/** Where the plan says the lifter should be (in sets) at `seconds`, linearly interpolated. */
function planSetsAt(plan: readonly PacePoint[], seconds: number): number {
  for (let i = 1; i < plan.length; i++) {
    const prev = plan[i - 1];
    const next = plan[i];
    if (!prev || !next) continue;
    if (seconds <= next.seconds) {
      const span = next.seconds - prev.seconds || 1;
      return prev.sets + ((seconds - prev.seconds) / span) * (next.sets - prev.sets);
    }
  }
  return plan[plan.length - 1]?.sets ?? 0;
}

/** Re-renders on a slow tick and whenever the app comes back to the foreground. */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
  return now;
}

/**
 * Workout pace tracker (issue #37): a live burn-up chart of sets completed
 * over time against the plan. The dashed line is the plan, the shaded band
 * is the "on pace" zone around it, the solid line is what's actually been
 * logged, and the hollow dot marks where the plan says you'd be right now —
 * so the gap between the two dots *is* the pace.
 */
export function PaceTracker({
  startedAt,
  exercises,
  calibration = null,
}: {
  startedAt: Date;
  exercises: readonly PaceExercise[];
  /** The plan learned from past workouts of this routine (issue #853). */
  calibration?: PaceCalibration | null;
}) {
  const now = useNow(TICK_MS);
  const gradientId = useId();
  const [expanded, setExpanded] = useState(false);
  const pace = computePace({ startedAt, now, exercises, calibration });
  if (!pace || pace.setsPlanned === 0) return null;

  const style = STATUS_STYLE[pace.status];
  const {
    plan,
    actual,
    elapsedSeconds,
    toleranceSeconds,
    plannedTotalSeconds,
    projectedTotalSeconds,
  } = pace;

  const maxSeconds =
    Math.max(plannedTotalSeconds, projectedTotalSeconds, elapsedSeconds, 60) * 1.04;
  const maxSets = Math.max(pace.setsPlanned, pace.setsDone, 1);

  const x = (seconds: number) =>
    PAD_X + (Math.min(seconds, maxSeconds) / maxSeconds) * (WIDTH - PAD_X * 2);
  const y = (sets: number) =>
    HEIGHT - PAD_BOTTOM - (sets / maxSets) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const planPath = plan
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.seconds).toFixed(1)},${y(p.sets).toFixed(1)}`)
    .join(" ");

  // The "on pace" zone: the plan line shifted early/late by the tolerance.
  const early = plan.map(
    (p) => `${x(Math.max(0, p.seconds - toleranceSeconds)).toFixed(1)},${y(p.sets).toFixed(1)}`,
  );
  const late = plan
    .map((p) => `${x(p.seconds + toleranceSeconds).toFixed(1)},${y(p.sets).toFixed(1)}`)
    .reverse();
  const bandPoints = [...early, ...late].join(" ");

  // Actual progress as steps: flat while resting, a jump at each logged set,
  // then flat out to "now".
  let actualPath = `M${x(0).toFixed(1)},${y(0).toFixed(1)}`;
  for (const point of actual.slice(1)) {
    actualPath += ` H${x(point.seconds).toFixed(1)} V${y(point.sets).toFixed(1)}`;
  }
  const liveEnd =
    pace.status === "done" ? (actual[actual.length - 1]?.seconds ?? 0) : elapsedSeconds;
  actualPath += ` H${x(liveEnd).toFixed(1)}`;
  const areaPath = `${actualPath} V${y(0).toFixed(1)} Z`;

  const nowX = x(liveEnd);
  const nowY = y(pace.setsDone);
  const ghostY = y(planSetsAt(plan, liveEnd));

  const finishAt = new Date(startedAt.getTime() + projectedTotalSeconds * 1000);
  const finishLabel = finishAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const summaryId = `${gradientId}-summary`;

  return (
    // A slim bar, one segment per planned set (#854); tapping it opens the
    // chart below.
    <section aria-label="Workout pace" className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={summaryId}
        className="flex min-h-11 flex-col justify-center gap-1.5 text-left"
      >
        <span className={`flex h-1.5 w-full gap-0.5 ${style.tone}`} aria-hidden="true">
          {pace.setsPlanned <= MAX_SEGMENTS ? (
            Array.from({ length: pace.setsPlanned }, (_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: one fixed segment per planned set
                key={i}
                className={`flex-1 rounded-full ${
                  i < pace.setsDone ? "bg-current" : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
            ))
          ) : (
            <span className="flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <span
                className="block h-full rounded-full bg-current"
                style={{ width: `${Math.min(100, (pace.setsDone / pace.setsPlanned) * 100)}%` }}
              />
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2 text-sm tabular-nums">
          <span className={`font-semibold ${style.tone}`}>
            {style.label}
            {pace.status !== "done" && (
              <span className="ml-1 font-medium opacity-80">{formatDelta(pace.deltaSeconds)}</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-500">
            {pace.status === "done" ? "Wrapped" : "Done"} ~{finishLabel}
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
        </span>
      </button>

      <div id={summaryId} hidden={!expanded} className={style.tone}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`${style.label}: ${pace.setsDone} of ${pace.setsPlanned} sets done after ${formatMinutes(elapsedSeconds)}, planned ${formatMinutes(plannedTotalSeconds)} total.`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <line
            x1={PAD_X}
            y1={y(0)}
            x2={WIDTH - PAD_X}
            y2={y(0)}
            className="stroke-zinc-300 dark:stroke-zinc-700"
          />
          <polygon points={bandPoints} className="fill-zinc-500/10 dark:fill-zinc-400/10" />
          <path
            d={planPath}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="stroke-zinc-400 dark:stroke-zinc-500"
          />
          <line
            x1={x(plannedTotalSeconds)}
            y1={y(maxSets)}
            x2={x(plannedTotalSeconds)}
            y2={y(0)}
            strokeDasharray="2 3"
            className="stroke-zinc-300 dark:stroke-zinc-700"
          />

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={actualPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {pace.status !== "done" && (
            <>
              <line
                x1={nowX}
                y1={Math.min(nowY, ghostY)}
                x2={nowX}
                y2={Math.max(nowY, ghostY)}
                stroke="currentColor"
                strokeOpacity={0.5}
                strokeWidth={1.5}
              />
              <circle
                cx={nowX}
                cy={ghostY}
                r={3.5}
                strokeWidth={1.5}
                className="fill-white stroke-zinc-400 dark:fill-zinc-950 dark:stroke-zinc-500"
              />
              <circle className="pace-now-ring" cx={nowX} cy={nowY} r={4.5} fill="currentColor" />
            </>
          )}
          <circle cx={nowX} cy={nowY} r={4.5} fill="currentColor" />
        </svg>

        <div className="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-500">
          <span className="tabular-nums">
            {pace.setsDone}/{pace.setsPlanned} sets
          </span>
          <span className="tabular-nums">{formatMinutes(elapsedSeconds)} in</span>
          <span className="tabular-nums">Plan {formatMinutes(plannedTotalSeconds)}</span>
        </div>
      </div>
    </section>
  );
}
