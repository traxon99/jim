"use client";

interface RestTimer {
  active: boolean;
  remaining: number;
  skip: () => void;
  adjust: (deltaSeconds: number) => void;
}

/** How much each −/+ tap takes off or adds (issue #324), as Strong and Hevy do. */
const ADJUST_SECONDS = 15;

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function RestTimerBar({ timer }: { timer: RestTimer }) {
  if (!timer.active) return null;

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Resting
        </span>
        <span className="text-2xl font-semibold tabular-nums">{formatClock(timer.remaining)}</span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => timer.adjust(-ADJUST_SECONDS)}
          aria-label={`${ADJUST_SECONDS} seconds less rest`}
          className="min-h-11 rounded-lg border border-zinc-300 px-2.5 text-sm font-medium tabular-nums dark:border-zinc-700"
        >
          −{ADJUST_SECONDS}s
        </button>
        <button
          type="button"
          onClick={() => timer.adjust(ADJUST_SECONDS)}
          aria-label={`${ADJUST_SECONDS} seconds more rest`}
          className="min-h-11 rounded-lg border border-zinc-300 px-2.5 text-sm font-medium tabular-nums dark:border-zinc-700"
        >
          +{ADJUST_SECONDS}s
        </button>
        <button
          type="button"
          onClick={() => timer.skip()}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
