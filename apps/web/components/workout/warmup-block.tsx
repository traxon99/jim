"use client";

import { formatClock, warmupTimerState } from "@jim/core";
import { ChevronDown, CircleCheck, Flame } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  startedAt: Date;
  targetMinutes: number | null;
  /** When the first main-workout set was logged — freezes the timer there. */
  endedAt: Date | null;
  /** Every warm-up has its sets logged — collapses the block (issue #179). */
  complete: boolean;
  children: React.ReactNode;
}

/**
 * The timed warm-up block at the start of a workout (issue #59): every
 * warm-up exercise grouped together under a timer that runs from the
 * session's start. Once the main workout begins (its first set is logged),
 * the timer freezes at how long the warm-up actually took. Once every
 * warm-up's sets are logged it collapses to a one-line "time to lift"
 * summary (issue #179), which can be tapped open again.
 */
export function WarmupBlock({ startedAt, targetMinutes, endedAt, complete, children }: Props) {
  const [now, setNow] = useState(() => new Date());
  // null = follow `complete`; a tap pins it open or shut until `complete`
  // next changes (e.g. a set deleted re-opens it, the last one logged
  // collapses it again).
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const [lastComplete, setLastComplete] = useState(complete);
  if (lastComplete !== complete) {
    setLastComplete(complete);
    setExpandedOverride(null);
  }
  const expanded = expandedOverride ?? !complete;

  useEffect(() => {
    if (endedAt) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [endedAt]);

  const timer = warmupTimerState(startedAt, endedAt ?? now, targetMinutes);

  let status: string;
  if (endedAt) status = `Took ${formatClock(timer.elapsedSeconds)}`;
  else if (timer.remainingSeconds == null) status = formatClock(timer.elapsedSeconds);
  else if (timer.isOver) status = "Time to lift";
  else status = `${formatClock(timer.remainingSeconds)} left`;

  const progress =
    timer.targetSeconds == null ? null : Math.min(1, timer.elapsedSeconds / timer.targetSeconds);

  if (complete && !expanded) {
    return (
      <section className="rounded-xl border border-orange-200 bg-orange-50/50 dark:border-orange-900/60 dark:bg-orange-950/20">
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setExpandedOverride(true)}
          className="flex min-h-11 w-full items-center justify-between gap-2 p-3 text-left"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 dark:text-orange-400">
            <CircleCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Warm-up complete — time to lift
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
            {formatClock(timer.elapsedSeconds)}
            <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50/50 p-3 dark:border-orange-900/60 dark:bg-orange-950/20">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
          <Flame className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Warm-up
          {targetMinutes != null && (
            <span className="font-normal normal-case tracking-normal text-orange-700/70 dark:text-orange-400/70">
              · {targetMinutes} min
            </span>
          )}
        </h2>
        <span
          className={`text-sm font-semibold tabular-nums ${
            timer.isOver && !endedAt
              ? "text-orange-700 dark:text-orange-400"
              : "text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {status}
        </span>
      </div>
      {complete && (
        <button
          type="button"
          aria-expanded
          onClick={() => setExpandedOverride(false)}
          className="-mt-1 self-start text-xs font-medium text-orange-700 underline underline-offset-4 dark:text-orange-400"
        >
          Warm-up complete — collapse
        </button>
      )}
      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950/60">
          <div
            className="h-full rounded-full bg-orange-500 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
