"use client";

import type { SetTimer } from "@/lib/sessions/use-set-timer";
import { formatClock } from "./rest-timer-bar";

const BAR_CLASS =
  "sticky bottom-0 z-10 flex min-w-0 items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950";
const LABEL_CLASS = "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/**
 * The working set timer's bar (issue #634), in the rest timer's spot when no
 * rest is running: Start set, then End set, then the set's time waiting for
 * the ✓ that logs it. Discard sits on the left, never in the spot End set
 * was just tapped in.
 */
export function SetTimerBar({
  timer,
  aboveTabBar = false,
}: {
  timer: SetTimer;
  /** Stick above the translucent tab bar, which overlays the shell's scroller. */
  aboveTabBar?: boolean;
}) {
  const style = aboveTabBar ? { bottom: "var(--tab-bar-height, 0px)" } : undefined;

  if (timer.phase === "idle") {
    return (
      <div style={style} className={BAR_CLASS}>
        <span className={LABEL_CLASS}>Set timer</span>
        <button
          type="button"
          onClick={timer.start}
          className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Start set
        </button>
      </div>
    );
  }

  if (timer.phase === "running") {
    return (
      <div style={style} className={BAR_CLASS}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={LABEL_CLASS}>Working</span>
          <span className="text-2xl font-semibold tabular-nums">{formatClock(timer.elapsed)}</span>
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
    <div style={style} className={BAR_CLASS}>
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
