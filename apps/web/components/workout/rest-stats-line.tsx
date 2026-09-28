import { type RestStatsSet, formatRestSeconds, isShortRest, restStats } from "@jim/core";

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
