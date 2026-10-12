import { useEffect, useRef } from "react";

/**
 * How long a logged set may take to show up in the live query before the
 * guard lets another log through anyway, so a query that never re-emits
 * can't lock the Log button for good.
 */
const LOG_GUARD_BACKSTOP_MS = 2000;

export interface LogGuard {
  /** Runs `log` unless one is already in flight; resolves false when skipped. */
  run(log: () => Promise<void>): Promise<boolean>;
  /** Lets the next log through: call once the logged set has rendered. */
  release(): void;
}

/**
 * Stops a double tap on a Log button from saving the same set twice
 * (issue #491). A log stays "in flight" until the caller releases it after
 * the new set reaches the live query, not just until `completeSet` resolves:
 * until then the row's index is unchanged, so a third tap would log it again.
 */
export function createLogGuard(backstopMs: number = LOG_GUARD_BACKSTOP_MS): LogGuard {
  let busy = false;
  let backstop: ReturnType<typeof setTimeout> | undefined;

  function release() {
    busy = false;
    clearTimeout(backstop);
  }

  return {
    async run(log) {
      if (busy) return false;
      busy = true;
      backstop = setTimeout(release, backstopMs);
      try {
        await log();
      } catch (error) {
        release();
        throw error;
      }
      return true;
    },
    release,
  };
}

/**
 * A `LogGuard` for one exercise section, released whenever `loggedSets`
 * (the section's live-query result) changes.
 */
export function useLogGuard(loggedSets: unknown): LogGuard {
  const guard = useRef<LogGuard | null>(null);
  if (!guard.current) guard.current = createLogGuard();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new sets array means the logged set has rendered.
  useEffect(() => {
    guard.current?.release();
  }, [loggedSets]);
  useEffect(() => () => guard.current?.release(), []);
  return guard.current;
}
