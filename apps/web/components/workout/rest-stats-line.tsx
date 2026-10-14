import {
  type RestStatsSet,
  type WorkStatsSet,
  formatRestSeconds,
  isShortRest,
  restStats,
  workStats,
} from "@jim/core";

/**
 * "Rest avg 1:32 (target 2:00) · 3 short" for a session's sets (issue #233);
 * nothing when no rest was recorded.
 */
export function RestStatsLine({
  sets,
  className = "",
}: {
  sets: readonly RestStatsSet[];
  className?: string;
}) {
  const stats = restStats(sets);
  if (stats.averageRestSeconds === null || stats.averageTargetSeconds === null) return null;
  return (
    <p className={`allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400 ${className}`}>
      Rest avg {formatRestSeconds(stats.averageRestSeconds)} (target{" "}
      {formatRestSeconds(stats.averageTargetSeconds)})
      {stats.shortCount > 0 && (
        <span className="text-amber-700 dark:text-amber-400"> · {stats.shortCount} short</span>
      )}
    </p>
  );
}

/** A set's own rest, e.g. "1:05 rest", amber when it was cut short. */
export function SetRestTag({ set }: { set: RestStatsSet }) {
  if (set.restSeconds == null) return null;
  const short = isShortRest(set.restSeconds, set.restTargetSeconds);
  return (
    <span
      className={`text-xs ${short ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-500"}`}
    >
      {formatRestSeconds(set.restSeconds)} rest{short ? " · short" : ""}
    </span>
  );
}

/**
 * "Set time avg 0:38 · 6:20 across 10 sets" from the working set timer
 * (issue #634); nothing when no set was timed.
 */
export function WorkStatsLine({
  sets,
  className = "",
}: {
  sets: readonly WorkStatsSet[];
  className?: string;
}) {
  const stats = workStats(sets);
  if (stats.averageWorkSeconds === null) return null;
  return (
    <p className={`allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400 ${className}`}>
      Set time avg {formatRestSeconds(stats.averageWorkSeconds)} ·{" "}
      {formatRestSeconds(stats.totalWorkSeconds)} across {stats.timedCount}{" "}
      {stats.timedCount === 1 ? "set" : "sets"}
    </p>
  );
}

/** A set's own time from the working set timer, e.g. "0:42 set". */
export function SetWorkTag({ set }: { set: WorkStatsSet }) {
  if (set.workSeconds == null) return null;
  return (
    <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
      {formatRestSeconds(set.workSeconds)} set
    </span>
  );
}
