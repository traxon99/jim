export interface WarmupTimerState {
  elapsedSeconds: number;
  /** null when no target length is set — the block then just counts up. */
  targetSeconds: number | null;
  remainingSeconds: number | null;
  isOver: boolean;
}

/**
 * The timed warm-up block at the start of a workout. Derived from the
 * session's absolute start time on every tick rather than accumulated, so
 * it stays correct across the app being backgrounded (ARCHITECTURE.md §2,
 * constraint 4 — same reasoning as the rest timer).
 */
export function warmupTimerState(
  startedAt: Date,
  now: Date,
  targetMinutes: number | null,
): WarmupTimerState {
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  if (targetMinutes == null || targetMinutes <= 0) {
    return { elapsedSeconds, targetSeconds: null, remainingSeconds: null, isOver: false };
  }
  const targetSeconds = Math.round(targetMinutes * 60);
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  return {
    elapsedSeconds,
    targetSeconds,
    remainingSeconds,
    isOver: elapsedSeconds >= targetSeconds,
  };
}

/** 75 → "1:15"; 3600 → "60:00". */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
