"use client";

import type { SetTimer } from "@/lib/sessions/use-set-timer";
import { SET_READY_SECONDS, type Tempo, type TempoCuePhase, tempoPhaseAt } from "@jim/core";
import { useRef } from "react";
import { formatClock } from "./rest-timer-bar";
import { timerBarClass, timerBarStyle, usePublishFloatingTimerHeight } from "./timer-bar-chrome";

const LABEL_CLASS = "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

const PHASE_LABELS: Record<TempoCuePhase, string> = { down: "Down", pause: "Pause", up: "Up" };
const PHASE_CLASSES: Record<TempoCuePhase, string> = {
  down: "text-blue-600 dark:text-blue-400",
  pause: "text-zinc-500 dark:text-zinc-400",
  up: "text-green-600 dark:text-green-400",
};

/**
 * The working set timer's bar (issue #634), in the rest timer's spot when no
 * rest is running: Start set, then End set, then the set's time waiting for
 * the ✓ that logs it. Discard sits on the left, never in the spot End set
 * was just tapped in.
 */
export function SetTimerBar({
  timer,
  onStart,
  cueTempo = null,
  aboveTabBar = false,
}: {
  timer: SetTimer;
  /** Start set; with tempo cues it begins the get-ready countdown (issue #846). */
  onStart: () => void;
  /** The tempo being called out, so the bar shows its current phase; null without cues. */
  cueTempo?: Tempo | null;
  /** Stick above the translucent tab bar, which overlays the shell's scroller. */
  aboveTabBar?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishFloatingTimerHeight(ref, aboveTabBar);
  const style = timerBarStyle(aboveTabBar);
  const barClass = timerBarClass(aboveTabBar);

  if (timer.phase === "idle") {
    return (
      <div ref={ref} style={style} className={barClass}>
        <span className={LABEL_CLASS}>Set timer</span>
        <button
          type="button"
          onClick={onStart}
          className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Start set
        </button>
      </div>
    );
  }

  if (timer.phase === "ready") {
    // Held for the first second, so a double tap on Start set can't land on
    // Skip or Cancel, which take its spot (#318).
    const justStarted = timer.readyRemaining >= SET_READY_SECONDS;
    return (
      <div ref={ref} style={style} className={barClass}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={LABEL_CLASS}>Ready</span>
          <span className="text-2xl font-semibold tabular-nums" aria-live="off">
            {formatClock(timer.readyRemaining)}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={timer.clear}
            disabled={justStarted}
            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={timer.skipReady}
            disabled={justStarted}
            aria-label="Skip the countdown and start the tempo"
            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (timer.phase === "running") {
    const phase = cueTempo ? tempoPhaseAt(cueTempo, timer.elapsed) : null;
    return (
      <div ref={ref} style={style} className={barClass}>
        <div className="flex min-w-0 items-baseline gap-2">
          {phase ? (
            <span className={`text-2xl font-bold ${PHASE_CLASSES[phase]}`}>
              {PHASE_LABELS[phase]}
            </span>
          ) : (
            <span className={LABEL_CLASS}>Working</span>
          )}
          <span
            className={
              phase
                ? "text-base font-medium text-zinc-500 tabular-nums dark:text-zinc-400"
                : "text-2xl font-semibold tabular-nums"
            }
          >
            {formatClock(timer.elapsed)}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={timer.clear}
            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
          >
            Cancel
          </button>
          {/* Held for the first second, so a double tap on Start set can't end it at 0:00. */}
          <button
            type="button"
            onClick={timer.end}
            disabled={timer.elapsed < 1}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            End set
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={style} className={barClass}>
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={timer.clear}
          className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
        >
          Discard
        </button>
        <span className="text-2xl font-semibold tabular-nums">{formatClock(timer.elapsed)}</span>
      </div>
      <span className="min-w-0 text-right text-sm text-zinc-600 dark:text-zinc-400">
        Log the set with ✓ to save it
      </span>
    </div>
  );
}
