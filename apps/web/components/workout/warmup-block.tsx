"use client";

import { formatClock, warmupTimerState } from "@jim/core";
import { Flame } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  startedAt: Date;
  targetMinutes: number | null;
  /** When the first main-workout set was logged — freezes the timer there. */
  endedAt: Date | null;
  children: React.ReactNode;
}

/**
 * The timed warm-up block at the start of a workout (issue #59): every
 * warm-up exercise grouped together under a timer that runs from the
 * session's start. Once the main workout begins (its first set is logged),
 * the timer freezes at how long the warm-up actually took.
 */
export function WarmupBlock({ startedAt, targetMinutes, endedAt, children }: Props) {
  const [now, setNow] = useState(() => new Date());

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
          className={`font-mono text-sm font-semibold tabular-nums ${
            timer.isOver && !endedAt
              ? "text-orange-700 dark:text-orange-400"
              : "text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {status}
        </span>
      </div>
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
